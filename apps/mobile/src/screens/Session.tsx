import { useAuth } from "@clerk/expo";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  EntryId,
  SessionId,
  type Entry,
  type GroupDetail,
  type PlayerId,
  type SessionDetail,
} from "@stacks/contracts";
import {
  formatDay,
  formatDuration,
  formatTime,
  gameNames,
  isAdmin,
  playerNames,
} from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { formatMoney } from "@stacks/shared/money";
import { playerResults } from "@stacks/shared/results";
import * as DateTime from "effect/DateTime";
import { useKeepAwake } from "expo-keep-awake";
import { useLayoutEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Skeleton, Surface, Tag } from "../components/ui/Surface";
import { useToast } from "../components/ui/Toast";
import { cn } from "../components/ui/cn";
import { EntrySheet, type EntryDraft, type EntryInput } from "../features/EntrySheet";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ sessionId: string }>;

export function SessionScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.session(SessionId.make(route.params.sessionId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(session) => (
          <Loaded
            query={stacks.group(session.session.groupId)}
            skeleton={<Skeleton className="h-96" />}
          >
            {(group) => <SessionView detail={session} group={group} />}
          </Loaded>
        )}
      </Loaded>
    </Screen>
  );
}

/** An entry recorded on this device that the server hasn't confirmed yet. */
type PendingEntry = EntryInput & { readonly id: EntryId; readonly occurredAt: DateTime.Utc };

function KeepAwake() {
  useKeepAwake();
  return null;
}

function SessionView({ detail, group }: { detail: SessionDetail; group: GroupDetail }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const { userId } = useAuth();
  const { session, venue } = detail;
  const live = session.status === "live";
  const currency = group.group.currency;
  const names = playerNames(group);
  const toast = useToast();
  const addEntry = useAction(stacks.Client.mutation("ledger", "addEntry"));
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  const [pending, setPending] = useState<ReadonlyArray<PendingEntry>>([]);
  // Entries undone here count as voided while the void saves.
  const [undone, setUndone] = useState<ReadonlySet<EntryId>>(new Set());
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [closing, setClosing] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: venue.name });
  }, [navigation, venue.name]);

  // Until the server confirms them, entries recorded here count as if they were already saved.
  const unsaved = pending.filter((entry) => !detail.entries.some((saved) => saved.id === entry.id));
  const replaced = new Set(unsaved.map((entry) => entry.replacesEntryId).filter(Boolean));
  const voidedHere = (id: EntryId) => replaced.has(id) || undone.has(id);
  const counted = [
    ...detail.entries.map((entry) =>
      voidedHere(entry.id) ? { ...entry, voidedAt: entry.occurredAt } : entry,
    ),
    ...unsaved.map((entry) => ({
      ...entry,
      voidedAt: voidedHere(entry.id) ? entry.occurredAt : null,
    })),
  ];
  const results = playerResults(counted);
  const cashedOut = new Set(
    counted.filter((e) => e.kind === "cash_out" && e.voidedAt === null).map((e) => e.playerId),
  );
  const lastBuyIn = (playerId: PlayerId) =>
    counted.findLast(
      (e) =>
        e.kind === "buy_in" &&
        e.playerId === playerId &&
        e.voidedAt === null &&
        e.counterpartyId === null,
    );

  /** Records an entry at once and saves it in the background; `saved` settles when that's done. */
  const record = (input: EntryInput) => {
    const entry: PendingEntry = {
      ...input,
      id: EntryId.make(newId()),
      occurredAt: DateTime.nowUnsafe(),
    };
    setPending((all) => [...all, entry]);
    const saved = addEntry
      .attempt({
        params: { sessionId: session.id },
        payload: {
          id: entry.id,
          kind: entry.kind,
          playerId: entry.playerId,
          counterpartyId: entry.counterpartyId,
          amount: entry.amount,
          note: entry.note,
          replacesEntryId: entry.replacesEntryId,
        },
      })
      .then(({ error }) => {
        if (error === null) return true;
        setPending((all) => all.filter((p) => p.id !== entry.id));
        toast({ message: error });
        return false;
      });
    return { id: entry.id, saved };
  };

  const undo = async (id: EntryId, saved: Promise<boolean>) => {
    setUndone((all) => new Set(all).add(id));
    if (!(await saved)) return;
    const { error } = await voidEntry.attempt({
      params: { entryId: id },
      payload: { reason: "Undone" },
    });
    if (error === null) return;
    setUndone((all) => {
      const next = new Set(all);
      next.delete(id);
      return next;
    });
    toast({ message: error });
  };

  const rebuy = (playerId: PlayerId, name: string, amount: Entry["amount"]) => {
    const { id, saved } = record({
      kind: "buy_in",
      playerId,
      counterpartyId: null,
      amount,
      note: null,
      replacesEntryId: null,
    });
    toast({
      message: `${name} rebought for ${formatMoney(amount, currency)}`,
      action: { label: "Undo", onPress: () => void undo(id, saved) },
    });
  };

  const canVoid = (entry: Entry) =>
    isAdmin(group) || entry.createdBy === userId || entry.playerId === group.myPlayerId;
  const history: ReadonlyArray<
    | { readonly saving: true; readonly entry: PendingEntry }
    | { readonly saving: false; readonly entry: Entry }
  > = [
    ...unsaved.map((entry) => ({ saving: true as const, entry })),
    ...detail.entries.map((entry) => ({ saving: false as const, entry })),
  ].toSorted(
    (a, b) =>
      DateTime.toEpochMillis(b.entry.occurredAt) - DateTime.toEpochMillis(a.entry.occurredAt),
  );

  return (
    <>
      {live ? <KeepAwake /> : null}
      <View className="gap-2">
        {live ? <Tag tone="live">Live</Tag> : <Tag>Closed</Tag>}
        <Text className="text-base text-muted">
          {gameNames[session.game]} · {formatDay(session.startedAt)} ·{" "}
          {formatTime(session.startedAt)}
          {/* Imported sessions end when they start: no length was recorded. */}
          {session.endedAt && DateTime.isGreaterThan(session.endedAt, session.startedAt)
            ? ` to ${formatTime(session.endedAt)} (${formatDuration(session.startedAt, session.endedAt)})`
            : ""}
        </Text>
        {session.notes ? <Text className="text-sm text-ink">{session.notes}</Text> : null}
      </View>

      <View className="gap-3">
        <SectionHeading
          action={
            live ? (
              <Button
                label="Add player"
                size="sm"
                variant="ghost"
                onPress={() => setAddingPlayer(true)}
              />
            ) : undefined
          }
        >
          Players
        </SectionHeading>
        {detail.playerIds.map((playerId) => {
          const result = results.get(playerId);
          const name = names.get(playerId) ?? "Player";
          const lastRebuy = lastBuyIn(playerId);
          return (
            <Surface key={playerId} className="gap-3 p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-0.5">
                  <Text numberOfLines={1} className="text-lg font-medium text-ink">
                    {name}
                  </Text>
                  <Text className="text-sm text-muted tabular-nums">
                    {result && result.buyIn === 0 && result.cashOut === 0 ? (
                      "Net result only"
                    ) : result ? (
                      <>
                        In{" "}
                        <Money amount={result.buyIn} currency={currency} className="text-muted" /> ·
                        Out{" "}
                        <Money amount={result.cashOut} currency={currency} className="text-muted" />
                      </>
                    ) : (
                      "No buy-ins yet"
                    )}
                  </Text>
                </View>
                {/* A closed session's results are final, cash-out or not. */}
                {result && (!live || cashedOut.has(playerId)) ? (
                  <Money
                    amount={result.net}
                    currency={currency}
                    tone="result"
                    className="text-xl"
                  />
                ) : result ? (
                  <Text className="text-sm text-muted">Playing</Text>
                ) : null}
              </View>
              {live ? (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <Button
                      label="Buy in"
                      accessibilityLabel={`Buy in for ${name}`}
                      size="lg"
                      className="flex-1"
                      onPress={() => setDraft({ kind: "buy_in", playerId })}
                    />
                    <Button
                      label="Cash out"
                      accessibilityLabel={`Cash out for ${name}`}
                      size="lg"
                      className="flex-1"
                      onPress={() => setDraft({ kind: "cash_out", playerId })}
                    />
                  </View>
                  <View className="flex-row gap-2">
                    {lastRebuy ? (
                      <Button
                        label={`Rebuy ${formatMoney(lastRebuy.amount, currency)}`}
                        accessibilityLabel={`Rebuy for ${name}`}
                        variant="primary"
                        className="flex-1"
                        haptic
                        onPress={() => rebuy(playerId, name, lastRebuy.amount)}
                      />
                    ) : null}
                    <Button
                      label="Adjust"
                      accessibilityLabel={`Adjust result for ${name}`}
                      variant="ghost"
                      className={lastRebuy ? undefined : "flex-1"}
                      onPress={() => setDraft({ kind: "adjustment", playerId })}
                    />
                  </View>
                </View>
              ) : null}
            </Surface>
          );
        })}
      </View>

      <View className="gap-2">
        <SectionHeading>History</SectionHeading>
        {history.length === 0 ? (
          <Text className="text-sm text-muted">
            Buy-ins and cash-outs show up here as you record them.
          </Text>
        ) : (
          <List>
            {history.map((item) => {
              const { entry, saving } = item;
              const voided = undone.has(entry.id) || (!item.saving && item.entry.voidedAt !== null);
              const voidReason = item.saving ? null : item.entry.voidReason;
              const counterparty = entry.counterpartyId ? names.get(entry.counterpartyId) : null;
              const actionable = live && !item.saving && !voided && canVoid(item.entry);
              const content = (
                <>
                  <Text numberOfLines={1} className="w-20 text-sm text-muted tabular-nums">
                    {formatTime(entry.occurredAt)}
                  </Text>
                  <View className="flex-1 gap-0.5">
                    <Text
                      className={cn("text-base", voided ? "text-muted line-through" : "text-ink")}
                    >
                      {names.get(entry.playerId)} {verbs[entry.kind]}{" "}
                      <Money
                        amount={entry.amount}
                        currency={currency}
                        tone={entry.kind === "adjustment" ? "result" : "plain"}
                        className={cn("font-medium", voided && "text-muted")}
                      />
                    </Text>
                    {counterparty || entry.note || voided || saving ? (
                      <Text className="text-sm text-muted">
                        {[
                          counterparty && entry.kind === "buy_in" ? `${counterparty} paid` : null,
                          counterparty && entry.kind === "cash_out"
                            ? `${counterparty} has the cash`
                            : null,
                          entry.note,
                          saving ? "Saving…" : null,
                          voided ? `Voided${voidReason ? `: ${voidReason}` : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                </>
              );
              return actionable && !item.saving ? (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityHint="Correct or void this entry"
                  onPress={() => setSelected(item.entry)}
                  className="flex-row items-center gap-3 border-t border-line px-4 py-3 active:bg-sunken"
                >
                  {content}
                </Pressable>
              ) : (
                <Row key={entry.id}>{content}</Row>
              );
            })}
          </List>
        )}
      </View>

      <StatusActions detail={detail} group={group} onClose={() => setClosing(true)} />

      {draft ? (
        <EntrySheet
          detail={group}
          draft={draft}
          onSubmit={(input) => {
            record(input);
          }}
          onClose={() => setDraft(null)}
        />
      ) : null}
      {selected ? (
        <EntryActionsSheet
          entry={selected}
          onClose={() => setSelected(null)}
          onCorrect={() => {
            setSelected(null);
            if (selected.kind !== "settlement")
              setDraft({ kind: selected.kind, playerId: selected.playerId, replaces: selected });
          }}
        />
      ) : null}
      {closing ? <CloseSheet detail={detail} onClose={() => setClosing(false)} /> : null}
      {addingPlayer ? (
        <AddPlayerSheet detail={detail} group={group} onClose={() => setAddingPlayer(false)} />
      ) : null}
    </>
  );
}

const verbs = {
  buy_in: "bought in",
  cash_out: "cashed out",
  adjustment: "adjusted",
  settlement: "paid",
} as const;

function StatusActions({
  detail,
  group,
  onClose,
}: {
  detail: SessionDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const reopen = useAction(stacks.Client.mutation("sessions", "reopen"));
  if (detail.session.status === "live") {
    return <Button label="Close session" size="lg" onPress={onClose} />;
  }
  if (!isAdmin(group)) return null;
  return (
    <View className="gap-2">
      <Button
        label="Reopen session"
        pending={reopen.pending}
        onPress={() => void reopen.run({ params: { sessionId: detail.session.id } })}
      />
      <Text className="text-sm text-muted">
        Reopen to fix a mistake. Closed sessions can't be edited.
      </Text>
      {reopen.error ? <FormError>{reopen.error}</FormError> : null}
    </View>
  );
}

function EntryActionsSheet({
  entry,
  onClose,
  onCorrect,
}: {
  entry: Entry;
  onClose: () => void;
  onCorrect: () => void;
}) {
  const stacks = useStacks();
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  const [reason, setReason] = useState("");
  const confirmVoid = async () => {
    if (
      await voidEntry.run({
        params: { entryId: entry.id },
        payload: { reason: reason.trim() || null },
      })
    )
      onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Fix this entry"
      description="Voided entries stay in the history, crossed out, and stop counting."
    >
      {entry.kind !== "settlement" ? (
        <Button label="Correct the amount or who paid" size="lg" onPress={onCorrect} />
      ) : null}
      <TextField
        label="Reason for voiding (optional)"
        value={reason}
        onChangeText={setReason}
        maxLength={280}
      />
      {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
      <Button
        label="Void entry"
        variant="danger"
        size="lg"
        pending={voidEntry.pending}
        onPress={() => void confirmVoid()}
      />
    </Sheet>
  );
}

function CloseSheet({ detail, onClose }: { detail: SessionDetail; onClose: () => void }) {
  const stacks = useStacks();
  const close = useAction(stacks.Client.mutation("sessions", "close"));
  const confirm = async () => {
    if (await close.run({ params: { sessionId: detail.session.id }, payload: {} })) onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Close this session?"
      description="Results lock in and the session stops taking entries. An admin can reopen it."
    >
      {close.error ? <FormError>{close.error}</FormError> : null}
      <Button
        label="Close session"
        variant="primary"
        size="lg"
        pending={close.pending}
        onPress={() => void confirm()}
      />
      <Button label="Keep playing" onPress={onClose} />
    </Sheet>
  );
}

function AddPlayerSheet({
  detail,
  group,
  onClose,
}: {
  detail: SessionDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const add = useAction(stacks.Client.mutation("sessions", "addPlayer"));
  const seated = new Set(detail.playerIds);
  const available = group.players.filter(
    (p) => !seated.has(p.id) && (p.role !== null || p.userId === null),
  );
  return (
    <Sheet open onClose={onClose} title="Add a player">
      {available.length === 0 ? (
        <Text className="text-sm text-muted">
          Everyone in the group is already in this session.
        </Text>
      ) : (
        <List>
          {available.map((player) => (
            <Row
              key={player.id}
              accessibilityHint="Adds them to this session"
              onPress={() =>
                void add
                  .run({
                    params: { sessionId: detail.session.id },
                    payload: { playerId: player.id },
                  })
                  .then((done) => (done ? onClose() : undefined))
              }
            >
              <Text className="text-base text-ink">{player.displayName}</Text>
            </Row>
          ))}
        </List>
      )}
      {add.error ? <FormError>{add.error}</FormError> : null}
    </Sheet>
  );
}

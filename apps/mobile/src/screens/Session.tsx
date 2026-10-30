import { useAuth } from "@clerk/expo";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  EntryId,
  MinorUnits,
  SessionId,
  type CurrencyCode,
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
import { tableView } from "@stacks/client-runtime/table";
import { chipOf } from "@stacks/client-runtime/trip";
import { formatMoney, parseMoney } from "@stacks/shared/money";
import { playerResults } from "@stacks/shared/results";
import { seatCount, seatsNow } from "@stacks/shared/seats";
import { buyInPresets } from "@stacks/shared/table";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useKeepAwake } from "expo-keep-awake";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { List, PageTitle, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { useToast } from "../components/ui/Toast";
import { cn } from "../components/ui/cn";
import { AddGuestSheet } from "../features/AddGuestSheet";
import { Chip } from "../features/Chip";
import { Reveal } from "../features/Reveal";
import { TableMap } from "../features/TableMap";
import { EntrySheet, type EntryDraft, type EntryInput } from "../features/EntrySheet";
import { Loaded, useAction, useOutbox, usePending, useStacks, useUnsaved } from "../lib/stacks";

type Props = StaticScreenProps<{ sessionId: string }>;

export function SessionScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen table={SessionId.make(route.params.sessionId)}>
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

function KeepAwake() {
  useKeepAwake();
  return null;
}

export function SessionView({ detail, group }: { detail: SessionDetail; group: GroupDetail }) {
  const stacks = useStacks();
  const { userId } = useAuth();
  const { session, venue } = detail;
  const live = session.status === "live";
  const currency = group.group.currency;
  const names = playerNames(group);
  const toast = useToast();
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  const outbox = useOutbox();
  const { pending: queued, sent } = useUnsaved(session.id, detail.entries);
  // Entries undone here count as voided while the void saves.
  const [undone, setUndone] = useState<ReadonlySet<EntryId>>(new Set());
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [refused, setRefused] = useState<{ id: EntryId; reason: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Entries recorded here count as if they were already saved until this screen has them back
  // from the server, except ones it refused.
  const unsaved = queued.map((p) => ({
    ...p.entry,
    occurredAt: p.entry.occurredAt!,
    failed: p.failed,
  }));
  const recorded = [
    ...sent.map((p) => ({ ...p.entry, occurredAt: p.entry.occurredAt! })),
    ...unsaved.filter((entry) => entry.failed === null),
  ];
  const replaced = new Set(recorded.map((entry) => entry.replacesEntryId));
  const voidedHere = (id: EntryId) => replaced.has(id) || undone.has(id);
  const counted = [
    ...detail.entries.map((entry) =>
      voidedHere(entry.id) ? { ...entry, voidedAt: entry.occurredAt } : entry,
    ),
    ...recorded.map((entry) => ({
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

  /** Records an entry at once; the outbox sends it now, or when there's signal again. */
  const record = (input: EntryInput) => {
    const id = EntryId.make(newId());
    void outbox.add(session.id, { ...input, id, occurredAt: DateTime.nowUnsafe() });
    return id;
  };

  const undo = async (id: EntryId) => {
    setUndone((all) => new Set(all).add(id));
    // An entry the server never got just leaves the outbox; one it has gets voided.
    await outbox.flush();
    if (outbox.pending().some((p) => p.entry.id === id)) return outbox.discard(id);
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

  // A rebuy's button turns into Undo for a few seconds, where the thumb already is.
  const [rebought, setRebought] = useState<ReadonlyMap<PlayerId, EntryId>>(new Map());
  const forget = (playerId: PlayerId, id?: EntryId) =>
    setRebought((all) => {
      if (id !== undefined && all.get(playerId) !== id) return all;
      const next = new Map(all);
      next.delete(playerId);
      return next;
    });
  const rebuy = (playerId: PlayerId, amount: Entry["amount"]) => {
    const id = record({
      kind: "buy_in",
      playerId,
      counterpartyId: null,
      amount,
      note: null,
      replacesEntryId: null,
    });
    setRebought((all) => new Map(all).set(playerId, id));
    setTimeout(() => forget(playerId, id), UNDO_MS);
  };
  // While playing you come first; once closed, the table reads like a receipt, best result first.
  const seats = detail.playerIds.toSorted((a, b) =>
    live
      ? Number(b === group.myPlayerId) - Number(a === group.myPlayerId)
      : (results.get(b)?.net ?? 0) - (results.get(a)?.net ?? 0),
  );
  // Results already in when the screen opened just sit there; ones that land here rack up.
  const [settledAtOpen] = useState(() => (live ? cashedOut : new Set(detail.playerIds)));
  const [closedAtOpen] = useState(!live);

  const canVoid = (entry: Entry) =>
    isAdmin(group) || entry.createdBy === userId || entry.playerId === group.myPlayerId;
  const history: ReadonlyArray<
    | { readonly saving: true; readonly entry: (typeof unsaved)[number] }
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
      <View className="gap-3">
        <PageTitle context={`${gameNames[session.game]} · ${formatDay(session.startedAt)}`}>
          {venue.name}
        </PageTitle>
        <View className="flex-row items-center gap-2">
          {live ? <Tag tone="live">Live</Tag> : <Tag>Closed</Tag>}
          <Text className="flex-1 text-sm text-muted">
            {formatTime(session.startedAt)}
            {/* Imported sessions end when they start: no length was recorded. */}
            {session.endedAt && DateTime.isGreaterThan(session.endedAt, session.startedAt)
              ? ` to ${formatTime(session.endedAt)} (${formatDuration(session.startedAt, session.endedAt)})`
              : ""}
          </Text>
        </View>
        <TicketStub
          players={detail.playerIds.length}
          results={[...results.values()]}
          currency={currency}
        />
        {session.notes ? <Text className="text-sm text-ink">{session.notes}</Text> : null}
      </View>

      {seatCount(session) ? (
        <TableMap
          key={seatCount(session)}
          detail={detail}
          seats={seatCount(session)!}
          view={tableView({
            closed: !live,
            seats: seatsNow(detail.seatings),
            results,
            cashedOut,
          })}
          currency={currency}
          names={names}
          chipOf={(playerId) => chipOf(group, playerId)}
        />
      ) : null}

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
        <List>
          {seats.map((playerId, rank) => {
            const result = results.get(playerId);
            const name = names.get(playerId) ?? "Player";
            const lastRebuy = lastBuyIn(playerId);
            const undoable = rebought.get(playerId);
            const out = cashedOut.has(playerId);
            const bought = result !== undefined && result.buyIn > 0;
            // A closed session's results are final, cash-out or not.
            const final = result !== undefined && (!live || out);
            const status = final
              ? formatMoney(result.net, currency, { signDisplay: "exceptZero" })
              : bought
                ? `in ${formatMoney(result.buyIn, currency)}, playing`
                : "no buy-in yet";
            return (
              <View
                key={playerId}
                className="flex-row items-center gap-3 border-t border-line pr-3"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${status}`}
                  accessibilityHint={live ? "Record a buy-in, cash-out or adjustment" : undefined}
                  disabled={!live}
                  onPress={() =>
                    setDraft({ kind: bought && !out ? "cash_out" : "buy_in", playerId })
                  }
                  className="min-h-16 flex-1 flex-row items-center gap-3 py-3 pl-4 active:bg-sunken"
                >
                  <Chip chip={chipOf(group, playerId)} name={name} size={32} />
                  <View className="flex-1 gap-0.5">
                    <Text
                      numberOfLines={1}
                      className="font-display text-lg tracking-wide text-ink uppercase"
                    >
                      {name}
                      {playerId === group.myPlayerId ? (
                        <Text className="font-sans text-sm tracking-normal text-muted normal-case">
                          {" "}
                          you
                        </Text>
                      ) : null}
                    </Text>
                    <Text className="text-sm text-muted tabular-nums">
                      {result && result.buyIn === 0 && result.cashOut === 0 ? null : result ? (
                        <>
                          In{" "}
                          <Money amount={result.buyIn} currency={currency} className="text-muted" />{" "}
                          · Out{" "}
                          <Money
                            amount={result.cashOut}
                            currency={currency}
                            className="text-muted"
                          />
                        </>
                      ) : (
                        "No buy-ins yet"
                      )}
                    </Text>
                  </View>
                  {final ? (
                    <Reveal
                      key={live ? "live" : "closed"}
                      animate={live ? !settledAtOpen.has(playerId) : !closedAtOpen}
                      delay={live ? 0 : rank * 90}
                    >
                      <Money
                        amount={result.net}
                        currency={currency}
                        tone="result"
                        className="text-xl"
                      />
                    </Reveal>
                  ) : null}
                </Pressable>
                {!live || out ? null : undoable ? (
                  <Button
                    label="Undo"
                    accessibilityLabel={`Undo rebuy for ${name}`}
                    size="sm"
                    className="min-w-20"
                    onPress={() => {
                      forget(playerId);
                      void undo(undoable);
                    }}
                  />
                ) : lastRebuy ? (
                  <Button
                    label={`+${formatMoney(lastRebuy.amount, currency)}`}
                    accessibilityLabel={`Rebuy for ${name}`}
                    variant="tint"
                    size="sm"
                    className="min-w-20"
                    haptic
                    onPress={() => rebuy(playerId, lastRebuy.amount)}
                  />
                ) : (
                  <Button
                    label="Buy in"
                    accessibilityLabel={`Buy in for ${name}`}
                    size="sm"
                    className="min-w-20"
                    onPress={() => setDraft({ kind: "buy_in", playerId })}
                  />
                )}
              </View>
            );
          })}
        </List>
        {live ? (
          <Text className="text-sm text-muted">
            Tap a player to cash them out or record anything else.
          </Text>
        ) : null}
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
                  <Text numberOfLines={1} className="w-20 font-mono text-xs text-muted">
                    {formatTime(entry.occurredAt)}
                  </Text>
                  <View className="flex-1 gap-0.5">
                    <Text
                      className={cn("text-base", voided ? "text-muted line-through" : "text-ink")}
                    >
                      {names.get(entry.playerId)}{" "}
                      {entry.kind === "cash_out" && entry.amount === 0 ? (
                        "busted"
                      ) : (
                        <>
                          {verbs[entry.kind]}{" "}
                          <Money
                            amount={entry.amount}
                            currency={currency}
                            tone={entry.kind === "adjustment" ? "result" : "plain"}
                            className={cn("font-medium", voided && "text-muted")}
                          />
                        </>
                      )}
                    </Text>
                    {counterparty || entry.note || voided || saving ? (
                      <Text className="text-sm text-muted">
                        {[
                          counterparty && entry.kind === "buy_in" ? `${counterparty} paid` : null,
                          counterparty && entry.kind === "cash_out"
                            ? `${counterparty} has the cash`
                            : null,
                          entry.note,
                          item.saving
                            ? (item.entry.failed ?? "Saved on this phone, sending")
                            : null,
                          voided ? `Voided${voidReason ? `: ${voidReason}` : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                </>
              );
              if (item.saving && item.entry.failed !== null) {
                const reason = item.entry.failed;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityHint="Try saving it again or discard it"
                    onPress={() => setRefused({ id: entry.id, reason })}
                    className="flex-row items-center gap-3 border-t border-line bg-danger/10 px-4 py-3 active:bg-sunken"
                  >
                    {content}
                  </Pressable>
                );
              }
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
          presets={buyInPresets(counted, draft.playerId)}
          onSubmit={(input) => {
            record(input);
            if (input.kind === "cash_out") succeed();
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
      {refused ? (
        <Sheet
          open
          onClose={() => setRefused(null)}
          title="This didn't save"
          description={refused.reason}
          footer={
            <>
              <Button
                label="Try again"
                variant="primary"
                size="lg"
                onPress={() => {
                  void outbox.retry(refused.id);
                  setRefused(null);
                }}
              />
              <Button
                label="Discard it"
                variant="danger"
                size="lg"
                onPress={() => {
                  outbox.discard(refused.id);
                  setRefused(null);
                }}
              />
            </>
          }
        />
      ) : null}
      {closing ? (
        <CloseSheet
          detail={detail}
          playing={seats
            .filter((id) => (results.get(id)?.buyIn ?? 0) > 0 && !cashedOut.has(id))
            .map((id) => ({ id, name: names.get(id) ?? "Player" }))}
          currency={currency}
          record={record}
          onClose={() => setClosing(false)}
        />
      ) : null}
      {addingPlayer ? (
        <AddPlayerSheet detail={detail} group={group} onClose={() => setAddingPlayer(false)} />
      ) : null}
    </>
  );
}

const UNDO_MS = 5000;

const succeed = () => {
  if (Platform.OS !== "web")
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

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
      footer={
        <Button
          label="Void entry"
          variant="danger"
          size="lg"
          pending={voidEntry.pending}
          onPress={() => void confirmVoid()}
        />
      }
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
    </Sheet>
  );
}

/**
 * Closes the table, taking the cash-outs of anyone still playing on the way, and can open the
 * next table with the same people.
 */
function CloseSheet({
  detail,
  playing,
  currency,
  record,
  onClose,
}: {
  detail: SessionDetail;
  playing: ReadonlyArray<{ readonly id: PlayerId; readonly name: string }>;
  currency: CurrencyCode;
  record: (input: EntryInput) => void;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const close = useAction(stacks.Client.mutation("sessions", "close"));
  const outbox = useOutbox();
  const unsent = usePending(detail.session.id).length;
  const [chips, setChips] = useState<ReadonlyMap<PlayerId, string>>(new Map());
  const [missing, setMissing] = useState(false);
  const confirm = async (next: boolean) => {
    const cashOuts = playing.map((player) => ({
      player,
      amount: Option.getOrNull(parseMoney(chips.get(player.id) ?? "", currency)),
    }));
    if (cashOuts.some(({ amount }) => amount === null || amount < 0)) return setMissing(true);
    setMissing(false);
    for (const { player, amount } of cashOuts)
      record({
        kind: "cash_out",
        playerId: player.id,
        counterpartyId: null,
        amount: amount!,
        note: null,
        replacesEntryId: null,
      });
    setChips(new Map());
    // Closing first would make the server refuse what's still waiting to be sent.
    await outbox.flush();
    if (outbox.pending().some((p) => p.sessionId === detail.session.id)) return;
    if (!(await close.run({ params: { sessionId: detail.session.id }, payload: {} }))) return;
    succeed();
    onClose();
    if (next)
      navigation.navigate("NewSession", { tripId: detail.session.tripId, from: detail.session.id });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Close this session?"
      description="Results lock in and the session stops taking entries. An admin can reopen it."
      footer={
        <>
          <Button
            label="Close session"
            variant="primary"
            size="lg"
            pending={close.pending}
            onPress={() => void confirm(false)}
          />
          <Button
            label="Close and move tables"
            accessibilityLabel="Close and start another session with the same players"
            size="lg"
            disabled={close.pending}
            onPress={() => void confirm(true)}
          />
          <Button label="Keep playing" variant="ghost" onPress={onClose} />
        </>
      }
    >
      {playing.length > 0 ? (
        <View className="gap-3">
          <Text className="text-sm text-ink">What did everyone still playing leave with?</Text>
          {playing.map((player) => (
            <TextField
              key={player.id}
              label={player.name}
              value={chips.get(player.id) ?? ""}
              onChangeText={(text) => setChips((all) => new Map(all).set(player.id, text))}
              placeholder="0 if they busted"
              keyboardType="decimal-pad"
              inputClassName="font-mono"
            />
          ))}
          {missing ? (
            <FormError>Enter what each of them cashed out, 0 if they busted.</FormError>
          ) : null}
        </View>
      ) : null}
      {unsent > 0 ? (
        <FormError>
          {unsent === 1 ? "1 entry hasn't" : `${unsent} entries haven't`} reached Stacks yet. Close
          once they have, so nothing is left out.
        </FormError>
      ) : null}
      {close.error ? <FormError>{close.error}</FormError> : null}
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
  const [addingGuest, setAddingGuest] = useState(false);
  const seated = new Set(detail.playerIds);
  const available = group.players.filter(
    (p) => !seated.has(p.id) && (p.role !== null || p.userId === null),
  );
  const seat = async (playerId: PlayerId) => {
    if (await add.run({ params: { sessionId: detail.session.id }, payload: { playerId } }))
      onClose();
  };
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
              onPress={() => void seat(player.id)}
            >
              <Text className="text-base text-ink">{player.displayName}</Text>
            </Row>
          ))}
        </List>
      )}
      {add.error ? <FormError>{add.error}</FormError> : null}
      <Button label="Not in the group? Add a guest" onPress={() => setAddingGuest(true)} />
      <AddGuestSheet
        detail={group}
        open={addingGuest}
        onClose={() => setAddingGuest(false)}
        onAdded={(id) => void seat(id)}
      />
    </Sheet>
  );
}

/** The table at a glance, like the stub of a betting ticket: who sat down, what went in and out. */
function TicketStub({
  players,
  results,
  currency,
}: {
  players: number;
  results: ReadonlyArray<{ buyIn: number; cashOut: number; net: number }>;
  currency: CurrencyCode;
}) {
  const total = (pick: (result: (typeof results)[number]) => number) =>
    MinorUnits.make(results.reduce((sum, result) => sum + pick(result), 0));
  const buyIn = total((r) => r.buyIn);
  const cashOut = total((r) => r.cashOut);
  // Imported sessions only have each player's net, so there's no money in or out to show.
  const cells =
    buyIn === 0 && cashOut === 0
      ? [
          {
            label: "Players",
            value: <Text className="font-mono text-base text-ink">{players}</Text>,
          },
          {
            label: "Table net",
            value: <Money amount={total((r) => r.net)} currency={currency} tone="result" />,
          },
        ]
      : [
          {
            label: "Players",
            value: <Text className="font-mono text-base text-ink">{players}</Text>,
          },
          { label: "In", value: <Money amount={buyIn} currency={currency} /> },
          { label: "Out", value: <Money amount={cashOut} currency={currency} /> },
        ];
  return (
    <View className="flex-row rounded-xl border border-dashed border-line-strong">
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          accessible
          className={cn(
            "flex-1 gap-0.5 px-3 py-2.5",
            index > 0 && "border-l border-dashed border-line-strong",
          )}
        >
          <Text className="font-mono text-[11px] tracking-[1px] text-muted uppercase">
            {cell.label}
          </Text>
          {cell.value}
        </View>
      ))}
    </View>
  );
}

import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  RECORDING_CURRENCY,
  visitTitle,
  type RecordingEvent,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { MinorUnits, VisitId, type EntryId, type PlayEntry } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";

import { Money } from "../components/Money";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { HeaderTitle } from "../components/ui/HeaderTitle";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { useRecordingState } from "../lib/recording";
import {
  BuyInTotalSheet,
  CashOutSheet,
  CorrectSheet,
  GameSheet,
  RebuySheet,
  SitDownSheet,
  ReopenSheet,
  StartSheet,
  StartTimeSheet,
  VoidSheet,
} from "../features/RecordingForms";
import { TableSection } from "../features/SharedTable";

type Props = StaticScreenProps<{ visitId: string }>;

/** One session of your own play, saved on this device. */
export function PlayScreen({ route }: Props) {
  const id = Option.getOrNull(VisitId.makeOption(route.params.visitId));
  return id ? <Visit visitId={id} /> : <Missing />;
}

function Title({
  tag,
  context,
  children,
}: {
  tag?: ReactNode;
  context?: string;
  children: string;
}) {
  const navigation = useNavigation();
  const headerTitle = useCallback(
    () => <HeaderTitle title={children} context={context} />,
    [children, context],
  );
  useLayoutEffect(() => {
    if (Platform.OS !== "web")
      navigation.setOptions({
        title: children,
        ...(Platform.OS === "ios"
          ? {
              headerTitle,
            }
          : {}),
      });
  }, [navigation, children, headerTitle]);
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {Platform.OS === "ios" ? null : (
          <Text accessibilityRole="header" className="shrink type-title text-ink">
            {children}
          </Text>
        )}
        {tag}
      </View>
      {context ? <Text className="text-sm text-muted">{context}</Text> : null}
    </View>
  );
}

function Missing() {
  const navigation = useNavigation();
  return (
    <PersonalScreen>
      <Title>Session</Title>
      <EmptyState
        title="This session isn't on this device"
        action={
          <Button
            label="Back to your play"
            className="mt-2 self-start"
            onPress={() =>
              navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } })
            }
          />
        }
      >
        Sessions are saved on the device they were recorded on.
      </EmptyState>
    </PersonalScreen>
  );
}

type Open =
  | {
      readonly type:
        | "rebuy"
        | "cash_out"
        | "reopen"
        | "start"
        | "return"
        | "buy_in"
        | "start_time"
        | "game";
    }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId };

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

function Visit({ visitId }: { visitId: VisitId }) {
  const { visit, status, error, retryLoad } = useRecordingVisit(visitId);
  const navigation = useNavigation();
  const [open, setOpen] = useState<Open | null>(null);
  const [saved, setSaved] = useState<{
    entryId: EntryId;
    text: string;
    undo?: boolean;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const quick = useRecordingSubmit();
  const table = useRecordingTable(visit?.visit.tableId ?? null);
  if (visit === null) return <Missing />;
  if (visit === undefined)
    return (
      <PersonalScreen>
        <View className="gap-2">
          <Title>Session</Title>
          <SaveStatus status={status} error={error} onRetry={retryLoad} />
        </View>
        {status === "load_failed" ? null : <Skeleton className="h-40 w-full rounded-xl" />}
      </PersonalScreen>
    );
  const live = visit.visit.finishedAt === null;
  const close = () => setOpen(null);
  const entry = (id: EntryId) => visit.entries.find((item) => item.id === id)!;
  const recorded = (entryId: EntryId, input: RecordingInput) => {
    close();
    setNotice(null);
    setSaved({
      entryId,
      text:
        input.type === "finish"
          ? `Cash-out of ${money(input.amount)} recorded. You've finished this session.`
          : input.type === "correct"
            ? "Correction saved."
            : input.type === "add" && input.kind === "buy_in"
              ? `Rebuy of ${money(input.amount)} recorded.`
              : "Saved.",
    });
  };
  const start = visit.visit.startedAt;
  const player = table?.visits.find((item) => item.visit.id === visitId);
  const own = player?.isSelf ?? true;
  // Back at the table: a new visit for whoever this was, once they aren't playing here.
  const canReturn =
    !live &&
    !!table &&
    player !== undefined &&
    !table.visits.some(
      (item) => item.player.id === player.player.id && item.visit.finishedAt === null,
    );
  // Whoever records for everyone at the table changes its game; a player who joined it can't.
  const canEditTable = table?.role !== "participant";
  const rebuy = async (amount: number) => {
    const receipt = await quick.submit({ type: "add", visitId, kind: "buy_in", amount });
    if (receipt?.command.type === "add") {
      setNotice(null);
      setSaved({
        entryId: receipt.command.entryId,
        text: `Rebuy of ${money(amount)} recorded.`,
        undo: true,
      });
    }
  };
  const undo = async (entryId: EntryId) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId,
      entryId,
      reason: "Undone",
      replacement: null,
    });
    if (receipt) setSaved({ entryId, text: "Rebuy undone. It stays in the history, voided." });
  };
  const edited = (text: string) => {
    close();
    setSaved(null);
    setNotice(text);
  };
  return (
    <PersonalScreen
      dock={
        live ? (
          <Button
            key="cash-out"
            label="Cash out"
            variant="primary"
            size="lg"
            haptic
            onPress={() => setOpen({ type: "cash_out" })}
          />
        ) : !own || table?.role === "participant" ? (
          <>
            {canReturn ? (
              <Button
                key="return"
                label="Back at the table"
                variant="primary"
                size="lg"
                onPress={() => setOpen({ type: "return" })}
              />
            ) : null}
            <Button
              key="reopen"
              label="Fix accidental finish"
              variant={canReturn ? "ghost" : "secondary"}
              size="lg"
              onPress={() => setOpen({ type: "reopen" })}
            />
          </>
        ) : (
          <>
            <Button
              key="start"
              label="Start another session"
              variant="primary"
              size="lg"
              onPress={() => setOpen({ type: "start" })}
            />
            <Button
              key="reopen"
              label="Fix accidental finish"
              variant="ghost"
              size="lg"
              onPress={() => setOpen({ type: "reopen" })}
            />
          </>
        )
      }
    >
      <View className="gap-2">
        <Title
          tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Finished"}</Tag>}
          context={
            live
              ? `Started ${formatDay(start)}, ${formatTime(start)}`
              : `${formatDay(start)} · ${formatTime(start)} to ${formatTime(visit.visit.finishedAt!)}`
          }
        >
          {own
            ? visitTitle(visit.table)
            : `${player!.player.displayName} · ${visitTitle(visit.table)}`}
        </Title>
        <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visitId} />
      </View>
      {live ? (
        <LiveHero visit={visit} canEditTable={canEditTable} onEdit={(type) => setOpen({ type })} />
      ) : (
        <VisitHero visit={visit} />
      )}
      {live ? (
        <View className="gap-2">
          <SectionHeading>Rebuy</SectionHeading>
          <View
            className="flex-row flex-wrap gap-2"
            accessibilityRole="toolbar"
            accessibilityLabel="Rebuy amounts"
          >
            {visit.presets.map((preset) => (
              <Button
                key={preset}
                label={`+ ${money(preset)}`}
                size="lg"
                haptic
                disabled={quick.pending}
                className="min-w-24 flex-1"
                onPress={() => void rebuy(preset)}
              />
            ))}
            <Button
              label="Other amount"
              variant="ghost"
              size="lg"
              className="min-w-24 flex-1"
              onPress={() => setOpen({ type: "rebuy" })}
            />
          </View>
          {quick.error ? <FormError>{quick.error}</FormError> : null}
        </View>
      ) : null}
      {notice ? (
        <View accessibilityLiveRegion="polite" className="rounded-xl bg-sunken px-4 py-2.5">
          <Text className="text-sm text-ink">{notice}</Text>
        </View>
      ) : null}
      {saved ? (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken py-1.5 pr-1.5 pl-4"
        >
          <Text className="min-w-0 flex-1 text-sm text-ink">{saved.text}</Text>
          <View className="flex-row gap-1">
            {saved.undo ? (
              <Button
                label="Undo"
                variant="ghost"
                size="sm"
                pending={quick.pending}
                onPress={() => void undo(saved.entryId)}
              />
            ) : null}
            <Button
              label="View entry"
              variant="ghost"
              size="sm"
              onPress={() => setOpen({ type: "inspect", entryId: saved.entryId })}
            />
          </View>
        </View>
      ) : null}
      <TableSection
        tableId={visit.visit.tableId}
        onOpen={(next) => {
          if (next === visitId) return;
          setSaved(null);
          navigation.dispatch(StackActions.push("Play", { visitId: next }));
        }}
      />
      <History visit={visit} onInspect={(entryId) => setOpen({ type: "inspect", entryId })} />
      {open?.type === "rebuy" ? (
        <RebuySheet visit={visit} onClose={close} onSaved={recorded} />
      ) : open?.type === "cash_out" ? (
        <CashOutSheet visit={visit} onClose={close} onSaved={recorded} />
      ) : open?.type === "buy_in" ? (
        <BuyInTotalSheet visit={visit} onClose={close} onSaved={() => edited("Buy-in saved.")} />
      ) : open?.type === "start_time" ? (
        <StartTimeSheet visit={visit} onClose={close} onSaved={() => edited("Start time saved.")} />
      ) : open?.type === "game" ? (
        <GameSheet visit={visit} onClose={close} onSaved={() => edited("Game saved.")} />
      ) : open?.type === "reopen" ? (
        <ReopenSheet
          visit={visit}
          onClose={close}
          onReopened={() => {
            close();
            setSaved(null);
          }}
        />
      ) : open?.type === "return" && player ? (
        <SitDownSheet
          tableId={visit.visit.tableId}
          player={player.player}
          onClose={close}
          onSeated={(next) => {
            close();
            setSaved(null);
            navigation.dispatch(StackActions.replace("Play", { visitId: next }));
          }}
        />
      ) : open?.type === "start" ? (
        <StartSheet
          onClose={close}
          onStarted={(next) => {
            close();
            setSaved(null);
            // The finished session is done with; back from the new one goes to your play.
            navigation.dispatch(StackActions.replace("Play", { visitId: next }));
          }}
        />
      ) : open?.type === "inspect" ? (
        <EntryInspector
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onShow={(entryId) => setOpen({ type: "inspect", entryId })}
          onCorrect={() => setOpen({ type: "correct", entryId: open.entryId })}
          onVoid={() => setOpen({ type: "void", entryId: open.entryId })}
        />
      ) : open?.type === "correct" ? (
        <CorrectSheet
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "void" ? (
        <VoidSheet
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onVoided={() => {
            close();
            setSaved({ entryId: open.entryId, text: "Entry voided. It stays in the history." });
          }}
        />
      ) : null}
    </PersonalScreen>
  );
}

const FIGURE = "type-hero";

/** Now, ticking every 30 seconds, for a live session's clock. */
function useMinuteClock() {
  const [now, setNow] = useState(() => DateTime.nowUnsafe());
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type EditField = "buy_in" | "start_time" | "game";

/** A live session at a glance: how long, how much in, what game, and a way to fix any of it. */
function LiveHero({
  visit,
  canEditTable,
  onEdit,
}: {
  visit: RecordingVisitView;
  canEditTable: boolean;
  onEdit: (field: EditField) => void;
}) {
  const now = useMinuteClock();
  const game = visit.table.game ? gameNames[visit.table.game] : null;
  return (
    <View className="gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-5">
      <View className="flex-row items-start gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="type-label text-muted">Playing for</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit className={cn(FIGURE, "text-ink")}>
            {formatDuration(visit.visit.startedAt, now)}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="type-label text-muted">In</Text>
          <Money amount={visit.totals.buyIn} currency={RECORDING_CURRENCY} fit className={FIGURE} />
        </View>
        <ActionMenu
          label="Edit session"
          actions={[
            { label: "Buy-in", onPress: () => onEdit("buy_in") },
            { label: "Start time", onPress: () => onEdit("start_time") },
            ...(canEditTable ? [{ label: "Game", onPress: () => onEdit("game") }] : []),
          ]}
        />
      </View>
      <Text className="type-footnote text-muted">
        {[
          game ?? "Game not set",
          visit.table.highLimit ? "High limit" : null,
          `since ${formatTime(visit.visit.startedAt)}`,
          visit.totals.cashOut > 0 ? `${money(visit.totals.cashOut)} out` : null,
          "result pending",
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

function VisitHero({ visit }: { visit: RecordingVisitView }) {
  const { totals, finalResult } = visit;
  if (finalResult === null) return null;
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5">
      <View className="gap-1">
        <Text className="type-label text-muted">Final result</Text>
        <Money
          amount={finalResult}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit
          className="type-hero"
        />
        <Text className="type-footnote text-muted">
          In <Money amount={totals.buyIn} currency={RECORDING_CURRENCY} className="text-muted" /> ·
          Out <Money amount={totals.cashOut} currency={RECORDING_CURRENCY} className="text-muted" />
        </Text>
      </View>
    </View>
  );
}

const entryName = (visit: RecordingVisitView, entry: PlayEntry) =>
  entry.kind === "buy_in"
    ? "Buy-in"
    : visit.finishCashOuts.has(entry.id)
      ? "Final cash-out"
      : "Cash-out";

const eventText = (event: RecordingEvent) =>
  event.type === "finished" ? "Finished playing" : `Reopened: ${event.reason}`;

type Line =
  | { readonly type: "entry"; readonly at: DateTime.Utc; readonly entry: PlayEntry }
  | { readonly type: "event"; readonly at: DateTime.Utc; readonly event: RecordingEvent };

function History({
  visit,
  onInspect,
}: {
  visit: RecordingVisitView;
  onInspect: (entryId: EntryId) => void;
}) {
  const state = useRecordingState();
  const view = useServerTable(visit.visit.tableId);
  const people = counterpartiesAt(state, visit.visit.tableId, visit.visit.playerId, view ?? null);
  const paid = (item: PlayEntry) => {
    if (item.counterpartyId === null) return null;
    const name =
      people.find((person) => person.id === item.counterpartyId)?.displayName ?? "someone";
    return `${item.kind === "cash_out" ? "Paid to" : "Paid by"} ${name}`;
  };
  const lines: Line[] = [
    ...visit.entries.map((entry) => ({ type: "entry" as const, at: entry.occurredAt, entry })),
    ...visit.events.map((event) => ({ type: "event" as const, at: event.at, event })),
  ].toSorted((a, b) => DateTime.toEpochMillis(b.at) - DateTime.toEpochMillis(a.at));
  return (
    <View className="gap-2">
      <SectionHeading
        count={visit.entries.length === 1 ? "1 entry" : `${visit.entries.length} entries`}
      >
        History
      </SectionHeading>
      <List>
        {lines.map((line) => {
          if (line.type === "event")
            return (
              <Row key={`${line.event.type}-${DateTime.toEpochMillis(line.at)}`}>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-base font-medium text-ink">{eventText(line.event)}</Text>
                  <Text className="text-sm text-muted">
                    {line.event.type === "reopened"
                      ? `${formatTime(line.at)} · Fixed an accidental finish`
                      : formatTime(line.at)}
                  </Text>
                </View>
              </Row>
            );
          const item = line.entry;
          const voided = item.voidedAt !== null;
          const name = entryName(visit, item);
          const time = formatTime(item.occurredAt);
          return (
            <Row
              key={item.id}
              onPress={() => onInspect(item.id)}
              accessibilityLabel={`${name}, ${money(item.amount)}, ${time}${voided ? ", voided" : ""}${item.replacesEntryId ? ", correction" : ""}`}
              accessibilityHint="Shows the entry, where you can correct or void it"
              className="min-h-14"
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <Text
                  className={cn(
                    "text-base font-medium",
                    voided ? "text-muted line-through" : "text-ink",
                  )}
                >
                  {name}
                </Text>
                <Text className="text-sm text-muted">
                  {[
                    time,
                    paid(item),
                    voided ? "Voided" : null,
                    item.replacesEntryId ? "Correction" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Money
                amount={item.amount}
                currency={RECORDING_CURRENCY}
                className={voided ? "text-muted line-through" : "font-semibold"}
              />
            </Row>
          );
        })}
      </List>
    </View>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row gap-4 border-t border-line px-4 py-3">
      <Text className="w-24 text-sm text-muted">{label}</Text>
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}

function EntryInspector({
  visit,
  entry,
  onClose,
  onShow,
  onCorrect,
  onVoid,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  onClose: () => void;
  onShow: (entryId: EntryId) => void;
  onCorrect: () => void;
  onVoid: () => void;
}) {
  const replacement = visit.replacedBy.get(entry.id);
  const at = (value: DateTime.Utc) => `${formatDay(value)}, ${formatTime(value)}`;
  const voided = entry.voidedAt !== null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={entryName(visit, entry)}
      {...(voided ? { description: "Voided. It no longer counts toward this session." } : {})}
      footer={
        voided ? undefined : (
          <>
            <Button label="Correct amount" size="lg" onPress={onCorrect} />
            <Button label="Void entry" variant="danger" size="lg" onPress={onVoid} />
          </>
        )
      }
    >
      <List>
        <Detail label="Amount">
          <Money
            amount={entry.amount}
            currency={RECORDING_CURRENCY}
            className={cn("text-base", voided && "line-through")}
          />
        </Detail>
        <Detail label="Time">
          <Text selectable className="text-base text-ink">
            {at(entry.occurredAt)}
          </Text>
        </Detail>
        <Detail label="Recorded">
          <Text className="text-base text-ink">By you on this device, {at(entry.createdAt)}</Text>
        </Detail>
        {entry.note ? (
          <Detail label="Note">
            <Text selectable className="text-base text-ink">
              {entry.note}
            </Text>
          </Detail>
        ) : null}
        {entry.voidedAt ? (
          <Detail label="Voided">
            <Text selectable className="text-base text-ink">
              {at(entry.voidedAt)} · {entry.voidReason}
            </Text>
          </Detail>
        ) : null}
        {entry.replacesEntryId ? (
          <Detail label="Corrects">
            <Button
              label="View original"
              size="sm"
              className="self-start"
              onPress={() => onShow(entry.replacesEntryId!)}
            />
          </Detail>
        ) : null}
        {replacement ? (
          <Detail label="Replaced by">
            <Button
              label="View correction"
              size="sm"
              className="self-start"
              onPress={() => onShow(replacement)}
            />
          </Detail>
        ) : null}
      </List>
    </Sheet>
  );
}

import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatDay, formatDuration, formatTime } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  cashOutNote,
  liveTable,
  tableActions,
  type TableAction,
  type TableSeat,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  LIVE_REBUY_AMOUNTS,
  sessionReadout,
  sessionEditFields,
  RECORDING_CURRENCY,
  visitTitle,
  type RecordingEvent,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { MinorUnits, VisitId, type EntryId, type PlayEntry } from "@stacks/contracts";
import { ownPlayers } from "@stacks/shared/recording";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Animated, Platform, Text, View, useWindowDimensions } from "react-native";

import { Money } from "../components/Money";
import { Button, IconButton } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { FormError } from "../components/ui/Field";
import { HeaderTitle } from "../components/ui/HeaderTitle";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { animate, duration, ease } from "../components/ui/motion";
import { cn } from "../components/ui/cn";
import { confirmAction } from "../components/ui/confirmAction";
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
  StartTimeSheet,
  VenueSheet,
  VoidSheet,
} from "../features/RecordingForms";
import { LiveSessionsBar } from "../features/LiveBar";
import { TableSection } from "../features/SharedTable";
import { TableTripSheet, TableTripButton } from "../features/TableTrip";
import {
  ActionSlot,
  LiveClock,
  SeatSheet,
  TableActionSheet,
  TableSeats,
  type TableRecorded,
} from "../features/LiveTable";

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
        | "trip"
        | "edit"
        | "history"
        | "rebuy"
        | "cash_out"
        | "reopen"
        | "return"
        | "buy_in"
        | "start_time"
        | "game"
        | "venue";
    }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit" | "delete_table"> }
  | { readonly type: "seat"; readonly seat: TableSeat };

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

function Visit({ visitId }: { visitId: VisitId }) {
  const { visit, status, error, retryLoad } = useRecordingVisit(visitId);
  const navigation = useNavigation();
  const [open, setOpen] = useState<Open | null>(null);
  // The toast for the last write here: yours, or one for another player at the table.
  const [saved, setSaved] = useState<{
    entryId: EntryId;
    text: string;
    undo?: boolean;
    visitId?: VisitId;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const quick = useRecordingSubmit();
  const state = useRecordingState();
  const [deletedHere, setDeletedHere] = useState(false);
  const table = useRecordingTable(visit?.visit.tableId ?? null);
  const server = useServerTable(visit?.visit.tableId ?? null);
  const seats = table ? liveTable(table, server) : null;
  // Two side-by-side actions don't fit at large text on Android, so they stack.
  const { fontScale } = useWindowDimensions();
  const stacked = Platform.OS === "android" && fontScale > 1.2;
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
    // Cashing out while others play leaves you recording for them, on the table.
    if (
      input.type === "finish" &&
      own &&
      table &&
      table.role !== "participant" &&
      seats?.seats.some((seat) => seat.playing && seat.visitId !== visitId)
    ) {
      navigation.dispatch(StackActions.replace("Table", { tableId: table.table.id }));
      return;
    }
    setSaved({
      entryId,
      undo: input.type === "add" && input.kind === "buy_in",
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
  // Whoever records for everyone at the table changes its game and casino; a player who joined it
  // can't.
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
  const undo = async (entryId: EntryId, of: VisitId = visitId) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId: of,
      entryId,
      reason: "Undone",
      replacement: null,
    });
    if (receipt) setSaved({ entryId, text: "Rebuy undone. It stays in the history, voided." });
  };
  const fromTable = ({ entryId, ...rest }: TableRecorded) => {
    close();
    if (entryId) setSaved({ entryId, ...rest });
    else {
      setSaved(null);
      setNotice(rest.text);
    }
  };
  const edited = (text: string) => {
    close();
    setSaved(null);
    setNotice(text);
  };
  const canDelete = state !== null && ownPlayers(state).includes(visit.visit.playerId);
  const shared = (seats?.seats.length ?? 1) > 1;
  const actions = live
    ? tableActions(table?.role ?? "participant", { playing: true, closed: false, empty: false })
    : (["edit"] as const);
  const act = (action: TableAction) =>
    setOpen(
      action === "edit"
        ? { type: "edit" }
        : action === "delete_table"
          ? null
          : { type: "action", action },
    );
  const restore = async () => {
    if (await quick.submit({ type: "restore_visit", visitId })) setDeletedHere(false);
  };
  const deleteVisit = () =>
    confirmAction(
      shared ? "Delete my visit?" : "Delete this session?",
      `${visitTitle(visit.table)} · ${visit.venue?.name ?? "No casino set"}\n${formatDay(start)}, ${formatTime(start)} · Buy-in ${money(visit.totals.buyIn)}\n\nYour entries will be voided and this session will stop counting. Other players keep their sessions. You can restore yours later.`,
      shared ? "Delete my visit" : "Delete session",
      () => {
        void (async () => {
          if (await quick.submit({ type: "delete_visit", visitId })) {
            close();
            setSaved(null);
            setDeletedHere(true);
          }
        })();
      },
    );
  if (visit.visit.deletedAt !== undefined)
    return (
      <PersonalScreen
        dock={
          canDelete && deletedHere ? (
            <RecordingToast>
              <Text className="min-w-0 flex-1 text-sm text-ink-inverse">Session deleted</Text>
              <Button
                label="Undo"
                size="sm"
                pending={quick.pending}
                onPress={() => void restore()}
              />
              <Button label="Dismiss" size="sm" onPress={() => setDeletedHere(false)} />
            </RecordingToast>
          ) : undefined
        }
      >
        <Title>Session deleted</Title>
        <Text className="text-muted">
          This session no longer counts. You can restore it from All sessions.
        </Text>
        <Button label="All sessions" onPress={() => navigation.navigate("History")} />
        {canDelete ? (
          <Button
            label="Restore"
            variant="secondary"
            pending={quick.pending}
            onPress={() => void restore()}
          />
        ) : null}
        {quick.error ? <FormError>{quick.error}</FormError> : null}
        <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visitId} />
        <TableSection
          tableId={visit.visit.tableId}
          onOpen={(next) => navigation.dispatch(StackActions.push("Play", { visitId: next }))}
        />
      </PersonalScreen>
    );
  const toast = saved ? (
    <RecordingToast key={saved.entryId}>
      <Text className="min-w-0 flex-1 text-sm text-ink-inverse">{saved.text}</Text>
      {saved.undo ? (
        <Button
          label="Undo"
          pending={quick.pending}
          size="sm"
          onPress={() => void undo(saved.entryId, saved.visitId)}
        />
      ) : saved.visitId && saved.visitId !== visitId ? (
        <Button label="Dismiss" size="sm" onPress={() => setSaved(null)} />
      ) : (
        <Button
          label="View entry"
          size="sm"
          onPress={() => setOpen({ type: "inspect", entryId: saved.entryId })}
        />
      )}
    </RecordingToast>
  ) : null;
  return (
    <PersonalScreen
      session
      felt={live}
      dock={
        <>
          <LiveSessionsBar except={visitId} />
          {notice ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl bg-fill px-4 py-2">
              <Text className="text-sm text-ink">{notice}</Text>
            </View>
          ) : null}
          {toast}
          {quick.error ? <FormError>{quick.error}</FormError> : null}
          {live ? (
            <>
              <Text className="type-label text-[13px] text-felt-ink">Rebuy</Text>
              <View
                className="flex-row gap-2"
                accessibilityRole="toolbar"
                accessibilityLabel="Rebuy amounts"
              >
                {LIVE_REBUY_AMOUNTS.map((preset) => (
                  <Button
                    key={preset}
                    label={`+ ${money(preset)}`}
                    size="lg"
                    haptic
                    disabled={quick.pending}
                    className="min-w-0 flex-1"
                    onPress={() => void rebuy(preset)}
                  />
                ))}
                <Button
                  label="Other"
                  size="lg"
                  disabled={quick.pending}
                  className="min-w-0 flex-1"
                  onPress={() => setOpen({ type: "rebuy" })}
                />
              </View>
              <Button
                label="Cash out"
                variant="primary"
                size="lg"
                haptic
                disabled={quick.pending}
                onPress={() => setOpen({ type: "cash_out" })}
              />
            </>
          ) : (
            <>
              <Text className="type-footnote text-muted">
                Undo reopens this session. Returning starts a new one.
              </Text>
              <View className={stacked ? "gap-2" : "flex-row gap-2"}>
                <Button
                  label="Undo cash-out"
                  size="lg"
                  {...(stacked ? {} : { className: "flex-1" })}
                  onPress={() => setOpen({ type: "reopen" })}
                />
                {canReturn ? (
                  <Button
                    label="Back at the table"
                    variant="primary"
                    size="lg"
                    {...(stacked ? {} : { className: "flex-1" })}
                    onPress={() => setOpen({ type: "return" })}
                  />
                ) : null}
              </View>
            </>
          )}
        </>
      }
    >
      <VisitHeader
        visit={visit}
        since={seats?.startedAt ?? visit.visit.startedAt}
        actions={actions}
        onAction={act}
      />
      {live ? (
        <>
          <LiveHero visit={visit} name={own ? undefined : player?.player.displayName} />
          <View className="items-center">
            <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visitId} felt />
          </View>
          {seats && shared ? (
            <TableSeats
              table={seats}
              current={visitId}
              onSeat={(seat) => setOpen({ type: "seat", seat })}
              onSelf={(next) => navigation.dispatch(StackActions.push("Play", { visitId: next }))}
            />
          ) : null}
        </>
      ) : (
        <>
          <Text
            accessibilityRole="header"
            className="type-title text-[28px] leading-[34px] text-ink"
          >
            {own
              ? visitTitle(visit.table)
              : `${player!.player.displayName} · ${visitTitle(visit.table)}`}
          </Text>
          <Text className="type-footnote text-muted">
            {[
              "Finished",
              visit.venue?.name,
              formatDay(start),
              `${formatTime(start)}–${formatTime(visit.visit.finishedAt!)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <VisitHero visit={visit} />
          <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visitId} />
          <TableSection
            tableId={visit.visit.tableId}
            onOpen={(next) => {
              if (next !== visitId) {
                setSaved(null);
                navigation.dispatch(StackActions.push("Play", { visitId: next }));
              }
            }}
          />
          <History visit={visit} onInspect={(entryId) => setOpen({ type: "inspect", entryId })} />
        </>
      )}
      {open?.type === "edit" ? (
        <Sheet
          open
          title={own ? "Edit my session" : `Edit ${player?.player.displayName ?? "their"} session`}
          onClose={close}
          footer={<Button label="Done" onPress={close} />}
        >
          <List>
            {sessionEditFields(visit, canEditTable).map(({ field: type, label, value }) => (
              <Row key={type} onPress={() => setOpen({ type })}>
                <Text className="flex-1 type-body text-ink">{label}</Text>
                <Text className="max-w-[60%] shrink type-callout text-muted">{value}</Text>
                <Icon name="chevron-right" color="muted" size={18} />
              </Row>
            ))}
          </List>
          {state && ownPlayers(state).includes(visit.table.starterPlayerId) ? (
            <TableTripButton
              attached={visit.table.tripId !== null}
              onOpen={() => setOpen({ type: "trip" })}
            />
          ) : null}
          <Button
            label={own ? "Your history" : "History"}
            variant="ghost"
            className="self-start"
            onPress={() => setOpen({ type: "history" })}
          />
          {canDelete ? (
            <Button
              label={shared ? "Delete my visit" : "Delete session"}
              variant="danger"
              pending={quick.pending}
              onPress={deleteVisit}
            />
          ) : null}
        </Sheet>
      ) : open?.type === "action" && table ? (
        <TableActionSheet
          action={open.action}
          table={table}
          onClose={close}
          onAdded={(name) => edited(`${name} is at the table.`)}
        />
      ) : open?.type === "seat" && seats ? (
        <SeatSheet
          seat={open.seat}
          table={seats}
          onClose={close}
          onRecorded={fromTable}
          onSeated={(_, name) => edited(`${name} is back at the table.`)}
          onHistory={(next) => {
            close();
            navigation.dispatch(StackActions.push("Play", { visitId: next }));
          }}
        />
      ) : open?.type === "history" ? (
        <Sheet open title="Your history" onClose={close}>
          <History visit={visit} onInspect={(entryId) => setOpen({ type: "inspect", entryId })} />
        </Sheet>
      ) : null}
      {open?.type === "rebuy" ? (
        <RebuySheet
          visit={visit}
          who={own ? undefined : player?.player.displayName}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "cash_out" ? (
        <CashOutSheet
          visit={visit}
          who={own ? undefined : player?.player.displayName}
          note={shared && seats ? cashOutNote(seats.seats, visitId) : undefined}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "buy_in" ? (
        <BuyInTotalSheet visit={visit} onClose={close} onSaved={() => edited("Buy-in saved.")} />
      ) : open?.type === "start_time" ? (
        <StartTimeSheet visit={visit} onClose={close} onSaved={() => edited("Start time saved.")} />
      ) : open?.type === "game" ? (
        <GameSheet visit={visit} onClose={close} onSaved={() => edited("Game saved.")} />
      ) : open?.type === "trip" ? (
        <TableTripSheet table={visit.table} onClose={close} onSaved={() => edited("Trip saved.")} />
      ) : open?.type === "venue" ? (
        <VenueSheet visit={visit} onClose={close} onSaved={() => edited("Casino saved.")} />
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

export function RecordingToast({ children }: { children: ReactNode }) {
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    animate(shown, { toValue: 1, duration: duration.toastIn, easing: ease.enter });
    return () => shown.stopAnimation();
  }, [shown]);
  return (
    <Animated.View
      style={{
        opacity: shown,
        transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2 rounded-xl bg-ink py-2 pr-2 pl-4"
      >
        {children}
      </View>
    </Animated.View>
  );
}

function VisitHeader({
  visit,
  since,
  actions,
  onAction,
}: {
  visit: RecordingVisitView;
  since: DateTime.Utc;
  actions: ReadonlyArray<TableAction>;
  onAction: (action: TableAction) => void;
}) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    return () => navigation.setOptions({ headerShown: true });
  }, [navigation]);
  const live = visit.visit.finishedAt === null;
  return (
    <View className="flex-row items-center justify-between gap-3">
      <BackButton />
      {live ? <LiveClock since={since} /> : <View className="flex-1" />}
      <ActionSlot actions={actions} onAction={onAction} />
    </View>
  );
}

/** Back to wherever this screen came from, or to your play when it opened from a link. */
export function BackButton() {
  const navigation = useNavigation();
  return (
    <IconButton
      accessibilityLabel="Back to your play"
      icon={
        <View className="rotate-180">
          <Icon name="arrow-right" color="ink" />
        </View>
      }
      onPress={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } })
      }
    />
  );
}

function LiveHero({ visit, name }: { visit: RecordingVisitView; name?: string | undefined }) {
  const summary = sessionReadout(visit, visit.visit.startedAt);
  return (
    <View className="gap-2.5 px-3 pt-16">
      <Text accessibilityRole="header" className="type-label text-[13px] text-felt-ink">
        {name ? `${name} · Bought in` : "Bought in"}
      </Text>
      <BuyInFigure amount={visit.totals.buyIn} />
      <Text className="type-heading font-medium text-felt-ink">
        {[visitTitle(visit.table), visit.venue?.name].filter(Boolean).join(" · ")}
      </Text>
      <Text className="type-footnote text-felt-soft">
        Started {formatTime(visit.visit.startedAt)} ·{" "}
        {summary.corrected
          ? "buy-in corrected"
          : `${summary.buyIns} ${summary.buyIns === 1 ? "buy-in" : "buy-ins"}`}
      </Text>
    </View>
  );
}

/** The live buy-in: whole dollars big, the cents small beside them. */
function BuyInFigure({ amount }: { amount: MinorUnits }) {
  const text = formatMoney(amount, RECORDING_CURRENCY, { trailingZeroDisplay: "auto" });
  const [, whole = text, cents = ""] = /^(.*\d)([.,]\d+\D*)$/.exec(text) ?? [];
  return (
    <Text
      testID="live-buy-in"
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-[88px] leading-[92px] font-bold tracking-[-3px] text-felt-ink tabular-nums"
    >
      {whole}
      <Text className="text-[36px] font-medium tracking-normal text-felt-soft">{cents}</Text>
    </Text>
  );
}

function VisitHero({ visit }: { visit: RecordingVisitView }) {
  const summary = sessionReadout(visit, visit.visit.finishedAt!);
  return (
    <View className="gap-5 rounded-[22px] bg-surface p-4">
      <View className="gap-1">
        <Text className="type-footnote text-muted">Your result</Text>
        <Money
          amount={visit.finalResult!}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit
          testID="visit-result"
          className="type-hero"
        />
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1 gap-1">
          <Text className="type-footnote text-muted">Bought in</Text>
          <Money
            amount={visit.totals.buyIn}
            currency={RECORDING_CURRENCY}
            className="type-number"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text className="type-footnote text-muted">Cashed out</Text>
          <Money
            amount={visit.totals.cashOut}
            currency={RECORDING_CURRENCY}
            className="type-number"
          />
        </View>
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1 gap-1">
          <Text className="type-footnote text-muted">Duration</Text>
          <Text className="type-number text-ink">
            {formatDuration(visit.visit.startedAt, visit.visit.finishedAt!)}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="type-footnote text-muted">Hourly result</Text>
          {summary.hourly === null ? (
            <Text className="text-muted">—</Text>
          ) : (
            <Text className="type-number">
              <Money
                amount={MinorUnits.make(summary.hourly)}
                currency={RECORDING_CURRENCY}
                tone="result"
              />
              <Text className="text-muted">/hr</Text>
            </Text>
          )}
        </View>
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
                className={voided ? "type-number text-muted line-through" : "type-number"}
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
            className={cn("type-number", voided && "line-through")}
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

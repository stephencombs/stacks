import {
  CommonActions,
  StackActions,
  useNavigation,
  type StaticScreenProps,
} from "@react-navigation/native";
import { formatDay, formatDuration, formatTime } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  cashOutNote,
  liveTable,
  tableActions,
  type TableAction,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  historyEntryName,
  historyLines,
  LIVE_REBUY_AMOUNTS,
  localDateText,
  localTimeText,
  parseStartedAt,
  sessionReadout,
  sessionEditFields,
  RECORDING_CURRENCY,
  UNDONE_REASON,
  visitTitle,
  type RecordingEvent,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { MinorUnits, VisitId, type EntryId, type Game, type PlayEntry } from "@stacks/contracts";
import { ownPlayers } from "@stacks/shared/recording";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Money } from "../components/Money";
import { Button, IconButton } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { Icon } from "../components/ui/Icon";
import { FormError } from "../components/ui/Field";
import { HeaderTitle } from "../components/ui/HeaderTitle";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { animate, duration, ease } from "../components/ui/motion";
import { cn } from "../components/ui/cn";
import { confirmAction } from "../components/ui/confirmAction";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import {
  formatDisplayMoney,
  HIDDEN_AMOUNT,
  HIDDEN_AMOUNT_LABEL,
  usePreferences,
} from "../lib/preferences";
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
import { afterClosing, type OpenSheet } from "../features/visitSheets";
import { withoutTable } from "../lib/tableRoutes";
import {
  ActionSlot,
  LiveClock,
  SeatSheet,
  TableActionSheet,
  TableSeats,
  type TableRecorded,
} from "../features/LiveTable";

type Props = StaticScreenProps<{ visitId: string; action?: string }>;

/** One session of your own play, saved on this device. */
export function PlayScreen({ route }: Props) {
  const id = Option.getOrNull(VisitId.makeOption(route.params.visitId));
  return id ? <Visit visitId={id} action={route.params.action} /> : <Missing />;
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

const money = (amount: number, showCents = false) =>
  formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY, {
    trailingZeroDisplay: showCents ? "auto" : "stripIfInteger",
  });

function Visit({ visitId, action }: { visitId: VisitId; action?: string }) {
  const { visit, status, error, retryLoad } = useRecordingVisit(visitId);
  const prefs = usePreferences();
  const navigation = useNavigation();
  const [open, setOpen] = useState<OpenSheet | null>(null);
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
  const loadedLive = visit !== null && visit !== undefined && visit.visit.finishedAt === null;
  const loadedActive = loadedLive && visit.visit.deletedAt === undefined;
  const [handledAction, setHandledAction] = useState<string | null>(null);
  if (action !== "cash_out" && handledAction !== null) {
    setHandledAction(null);
  } else if (action === "cash_out" && visit !== undefined && handledAction !== action) {
    setHandledAction(action);
    if (loadedActive) setOpen((current) => current ?? { type: "cash_out" });
  }
  useEffect(() => {
    if (action !== "cash_out" || visit === undefined) return;
    (navigation as { setParams?: (params: { action?: undefined }) => void }).setParams?.({
      action: undefined,
    });
  }, [action, navigation, visit]);
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
  const close = () => setOpen(afterClosing);
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
    const shown = (amount: number) =>
      formatDisplayMoney(MinorUnits.make(amount), RECORDING_CURRENCY, prefs);
    setSaved({
      entryId,
      undo: input.type === "add" && input.kind === "buy_in",
      text:
        input.type === "finish"
          ? `Cash-out of ${shown(input.amount)} recorded. You've finished this session.`
          : input.type === "correct"
            ? "Correction saved."
            : input.type === "add" && input.kind === "buy_in"
              ? `Rebuy of ${shown(input.amount)} recorded.`
              : "Saved.",
    });
  };
  const start = visit.visit.startedAt;
  const player = table?.visits.find((item) => item.visit.id === visitId);
  const own = player?.isSelf ?? true;
  const name = player?.player.displayName ?? "Their";
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
        text: `Rebuy of ${formatDisplayMoney(MinorUnits.make(amount), RECORDING_CURRENCY, prefs)} recorded.`,
        undo: true,
      });
    }
  };
  const undo = async (entryId: EntryId, of: VisitId = visitId) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId: of,
      entryId,
      reason: UNDONE_REASON,
      replacement: null,
    });
    if (receipt)
      setSaved({ entryId, visitId: of, text: "Rebuy undone. It stays in the history, voided." });
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
      `${visitTitle(visit.table)} · ${visit.venue?.name ?? "No casino set"}\n${formatDay(start)}, ${formatTime(start)} · Buy-in ${formatDisplayMoney(visit.totals.buyIn, RECORDING_CURRENCY, prefs)}\n\nYour entries will be voided and this session will stop counting. Other players keep their sessions. You can restore yours later.`,
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
      { dismissLabel: "Keep session", icon: "trash" },
    );
  if (visit.visit.deletedAt !== undefined)
    return (
      <PersonalScreen
        dock={
          canDelete && deletedHere ? (
            <RecordingToast>
              <Text
                className={cn(
                  "min-w-0 flex-1 text-sm",
                  Platform.OS === "android" ? "text-[#F9FAFB]" : "text-ink-inverse",
                )}
              >
                Session deleted
              </Text>
              {Platform.OS === "android" ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={quick.pending}
                  onPress={() => void restore()}
                  className="px-2 py-1 active:opacity-70"
                >
                  <Text className="type-callout font-semibold text-[#6EE7B7]">Undo</Text>
                </Pressable>
              ) : (
                <>
                  <Button
                    label="Undo"
                    size="sm"
                    pending={quick.pending}
                    onPress={() => void restore()}
                  />
                  <Button label="Dismiss" size="sm" onPress={() => setDeletedHere(false)} />
                </>
              )}
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
      <Text
        className={cn(
          "min-w-0 flex-1 text-sm",
          Platform.OS === "android" ? "text-[#F9FAFB]" : "text-ink-inverse",
        )}
      >
        {saved.text}
      </Text>
      {saved.undo ? (
        Platform.OS === "android" ? (
          <Pressable
            accessibilityRole="button"
            disabled={quick.pending}
            onPress={() => void undo(saved.entryId, saved.visitId)}
            className="px-2 py-1 active:opacity-70"
          >
            <Text className="type-callout font-semibold text-[#6EE7B7]">Undo</Text>
          </Pressable>
        ) : (
          <Button
            label="Undo"
            pending={quick.pending}
            size="sm"
            onPress={() => void undo(saved.entryId, saved.visitId)}
          />
        )
      ) : saved.visitId && saved.visitId !== visitId ? (
        Platform.OS === "android" ? null : (
          <Button label="Dismiss" size="sm" onPress={() => setSaved(null)} />
        )
      ) : Platform.OS === "android" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen({ type: "inspect", entryId: saved.entryId })}
          className="px-2 py-1 active:opacity-70"
        >
          <Text className="type-callout font-semibold text-[#6EE7B7]">View entry</Text>
        </Pressable>
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
              <View className="gap-2">
                <Text
                  className={cn(
                    Platform.OS === "android"
                      ? "type-label tracking-wider text-felt-ink/80 uppercase"
                      : "type-label text-[13px] text-felt-ink",
                  )}
                >
                  Rebuy
                </Text>
                <View
                  className="flex-row gap-2"
                  accessibilityRole="toolbar"
                  accessibilityLabel="Rebuy amounts"
                >
                  {LIVE_REBUY_AMOUNTS.map((preset) => (
                    <Button
                      key={preset}
                      label={`+ ${money(preset, prefs.showCents)}`}
                      variant={Platform.OS === "android" ? "felt" : "secondary"}
                      size="lg"
                      haptic
                      disabled={quick.pending}
                      className="min-w-0 flex-1"
                      onPress={() => void rebuy(preset)}
                    />
                  ))}
                  <Button
                    label="Other"
                    variant={Platform.OS === "android" ? "felt" : "secondary"}
                    size="lg"
                    disabled={quick.pending}
                    className="min-w-0 flex-1"
                    onPress={() => setOpen({ type: "rebuy" })}
                  />
                </View>
              </View>
              <Button
                label="Cash out"
                variant={Platform.OS === "android" ? "feltPrimary" : "primary"}
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
                  variant={Platform.OS === "android" ? "ghost" : "secondary"}
                  size="lg"
                  className={cn(
                    !stacked && "flex-1",
                    Platform.OS === "android" && "border border-line bg-transparent",
                  )}
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
        own={own}
        who={own ? undefined : name}
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
          {Platform.OS === "android" ? (
            <View className="flex-row items-center gap-3.5">
              <GameTile game={visit.table.game} gameName={visit.table.gameName} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text
                  accessibilityRole="header"
                  className="type-title text-[24px] leading-[30px] text-ink"
                >
                  {own
                    ? visitTitle(visit.table)
                    : `${player!.player.displayName} · ${visitTitle(visit.table)}`}
                </Text>
                <Text className="type-footnote text-muted">
                  {[visit.venue?.name, formatDay(start)].filter(Boolean).join(" · ")}
                </Text>
                <Text className="type-footnote text-muted tabular-nums">
                  {`${formatTime(start)}–${formatTime(visit.visit.finishedAt!)}`}
                </Text>
              </View>
            </View>
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
            </>
          )}
          <VisitHero visit={visit} own={own} />
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
          <History
            visit={visit}
            own={own}
            who={name}
            onInspect={(entryId) => setOpen({ type: "inspect", entryId })}
          />
        </>
      )}
      {open?.type === "edit" ? (
        <EditSessionSheet
          visit={visit}
          own={own}
          name={name}
          canEditTable={canEditTable}
          canDelete={canDelete}
          shared={shared}
          showTrip={state !== null && ownPlayers(state).includes(visit.table.starterPlayerId)}
          deletePending={quick.pending}
          onClose={close}
          onOpen={setOpen}
          onDelete={deleteVisit}
          onStartedSaved={() => setNotice("Start time saved.")}
        />
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
        <Sheet open title={own ? "Your history" : `${name}'s history`} onClose={close}>
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
        <BuyInTotalSheet
          visit={visit}
          own={own}
          onClose={close}
          onSaved={() => edited("Buy-in saved.")}
        />
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
            navigation.dispatch((state) =>
              CommonActions.reset(withoutTable(state, visit.visit.tableId)),
            );
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
        className={cn(
          "flex-row items-center",
          Platform.OS === "android"
            ? "gap-3 rounded-[4px] bg-[#1F2120] py-2 pr-2 pl-4 shadow-lg"
            : "gap-2 rounded-xl bg-ink py-2 pr-2 pl-4",
        )}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const tileCode: Record<Game, string> = {
  poker_cash: "PK",
  poker_tourney: "PK",
  blackjack: "BJ",
  craps: "CR",
  roulette: "RO",
  baccarat: "BA",
  slots: "SL",
  other: "OT",
};

function GameTile({ game, gameName }: { game: Game | null; gameName?: string | null }) {
  const custom = game === "other" ? gameName?.trim().replace(/\s+/g, "").slice(0, 2) : undefined;
  const code = custom && custom.length > 0 ? custom.toUpperCase() : game ? tileCode[game] : "PL";
  return (
    <View className="size-12 items-center justify-center rounded-xl bg-ink">
      <Text className="type-callout font-bold text-ink-inverse">{code}</Text>
    </View>
  );
}

function EditSessionSheet({
  visit,
  own,
  name,
  canEditTable,
  canDelete,
  shared,
  showTrip,
  deletePending,
  onClose,
  onOpen,
  onDelete,
  onStartedSaved,
}: {
  visit: RecordingVisitView;
  own: boolean;
  name: string;
  canEditTable: boolean;
  canDelete: boolean;
  shared: boolean;
  showTrip: boolean;
  deletePending: boolean;
  onClose: () => void;
  onOpen: (sheet: OpenSheet) => void;
  onDelete: () => void;
  onStartedSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const [now] = useState(() => DateTime.makeUnsafe(Date.now()));
  const initial = visit.visit.startedAt;
  const [date, setDate] = useState(() => localDateText(new Date(DateTime.toEpochMillis(initial))));
  const [time, setTime] = useState(() => localTimeText(initial));
  const [startError, setStartError] = useState<string | null>(null);
  const fields = sessionEditFields(visit, canEditTable);
  const firstEntry = visit.entries.reduce(
    (earliest, entry) =>
      DateTime.toEpochMillis(entry.occurredAt) < DateTime.toEpochMillis(earliest)
        ? entry.occurredAt
        : earliest,
    visit.visit.finishedAt ?? now,
  );
  const updateStarted = async (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    const parsed = parseStartedAt({ date: nextDate, time: nextTime }, initial, firstEntry);
    if (parsed.error !== null) {
      setStartError(parsed.error);
      return;
    }
    setStartError(null);
    const receipt = await save.submit({
      type: "edit_visit",
      visitId: visit.visit.id,
      startedAt: parsed.startedAt,
    });
    if (receipt) onStartedSaved();
  };
  if (Platform.OS !== "android")
    return (
      <Sheet
        open
        title={own ? "Edit my session" : `Edit ${name}'s session`}
        onClose={onClose}
        footer={<Button label="Done" onPress={onClose} />}
      >
        <List>
          {fields.map(({ field: type, label, value }) => (
            <Row key={type} onPress={() => onOpen({ type })}>
              <Text className="flex-1 type-body text-ink">{label}</Text>
              <Text className="max-w-[60%] shrink type-callout text-muted">{value}</Text>
              <Icon name="chevron-right" color="muted" size={18} />
            </Row>
          ))}
        </List>
        {showTrip ? (
          <TableTripButton
            attached={visit.table.tripId !== null}
            onOpen={() => onOpen({ type: "trip" })}
          />
        ) : null}
        <Button
          label={own ? "Your history" : `${name}'s history`}
          variant="ghost"
          className="self-start"
          onPress={() => onOpen({ type: "history" })}
        />
        {canDelete ? (
          <Button
            label={shared ? "Delete my visit" : "Delete session"}
            variant="danger"
            pending={deletePending}
            onPress={onDelete}
          />
        ) : null}
      </Sheet>
    );
  const buyInValue = fields.find((f) => f.field === "buy_in")?.value ?? "";
  const gameValue = fields.find((f) => f.field === "game")?.value ?? "Not set";
  const venueValue = fields.find((f) => f.field === "venue")?.value ?? "Not set";
  return (
    <Sheet
      open
      title={own ? "Edit my session" : `Edit ${name}'s session`}
      onClose={onClose}
      footer={<Button label="Done" size="lg" onPress={onClose} />}
    >
      <List>
        <Row onPress={() => onOpen({ type: "buy_in" })}>
          <Text className="flex-1 type-body text-ink">Buy-in total</Text>
          <Text className="max-w-[60%] shrink type-callout text-muted">{buyInValue}</Text>
          <Icon name="chevron-right" color="muted" size={18} />
        </Row>
        <Row>
          <Text className="flex-1 type-body text-ink">Started</Text>
          <View className="flex-row items-center gap-2">
            <DateTimeField
              compact
              label="Start date"
              kind="date"
              value={date}
              onChange={(next) => void updateStarted(next, time)}
              maximumDate={new Date(DateTime.toEpochMillis(now))}
            />
            <DateTimeField
              compact
              label="Start time"
              kind="time"
              value={time}
              onChange={(next) => void updateStarted(date, next)}
            />
          </View>
        </Row>
        {canEditTable ? (
          <>
            <Row onPress={() => onOpen({ type: "game" })}>
              <Text className="flex-1 type-body text-ink">Game</Text>
              <View className="flex-row items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                <View className="size-2.5 rounded-full bg-live" />
                <Text numberOfLines={1} className="max-w-44 type-callout font-medium text-ink">
                  {gameValue}
                </Text>
              </View>
            </Row>
            <Row onPress={() => onOpen({ type: "venue" })}>
              <Text className="flex-1 type-body text-ink">Casino</Text>
              <Text className="max-w-[60%] shrink type-callout text-muted">{venueValue}</Text>
              <Icon name="chevron-right" color="muted" size={18} />
            </Row>
          </>
        ) : null}
      </List>
      {startError ? <FormError>{startError}</FormError> : null}
      {save.error ? <FormError>{save.error}</FormError> : null}
      {showTrip ? (
        <TableTripButton
          attached={visit.table.tripId !== null}
          onOpen={() => onOpen({ type: "trip" })}
        />
      ) : null}
      {canDelete ? (
        <Pressable
          accessibilityRole="button"
          disabled={deletePending}
          onPress={onDelete}
          className="min-h-11 flex-row items-center gap-2 self-start px-1 py-1 active:opacity-70"
        >
          <Icon name="trash" color="loss" size={18} />
          <Text className="type-callout font-medium text-loss">
            {shared ? "Delete my visit" : "Delete session"}
          </Text>
        </Pressable>
      ) : null}
      {visit.visit.finishedAt === null ? (
        <Button
          label={own ? "Your history" : `${name}'s history`}
          variant="ghost"
          className="self-start"
          onPress={() => onOpen({ type: "history" })}
        />
      ) : null}
    </Sheet>
  );
}

function VisitHeader({
  visit,
  since,
  actions,
  onAction,
  own = true,
  who,
}: {
  visit: RecordingVisitView;
  since: DateTime.Utc;
  actions: ReadonlyArray<TableAction>;
  onAction: (action: TableAction) => void;
  own?: boolean;
  who?: string | undefined;
}) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    return () => navigation.setOptions({ headerShown: true });
  }, [navigation]);
  const live = visit.visit.finishedAt === null;
  const routes = navigation.getState?.()?.routes;
  const prev = routes && routes.length > 1 ? routes[routes.length - 2] : undefined;
  const nested = prev?.state as
    | { routes?: ReadonlyArray<{ name: string }>; index?: number }
    | undefined;
  const fromStats =
    prev?.name === "Stats" ||
    prev?.name === "StatsTab" ||
    nested?.routes?.[nested.index ?? 0]?.name === "StatsTab";
  const fromTable = prev?.name === "Table";
  const backLabel = live && own && !fromStats && !fromTable ? "Back to your play" : undefined;
  return (
    <View className="flex-row items-center justify-between gap-3">
      <BackButton label={backLabel} felt={live} />
      {live ? <LiveClock since={since} /> : <View className="flex-1" />}
      <ActionSlot felt={live} actions={actions} onAction={onAction} who={who} />
    </View>
  );
}

const backDestinationLabel = (
  state:
    | { readonly routes?: ReadonlyArray<{ readonly name: string; readonly state?: unknown }> }
    | undefined,
) => {
  const routes = state?.routes;
  const prev = routes && routes.length > 1 ? routes[routes.length - 2] : undefined;
  if (!prev) return "Back to your play";
  if (prev.name === "Table") return "Back to the table";
  if (prev.name === "Stats" || prev.name === "StatsTab") return "Back to Stats";
  if (prev.name === "Tabs") {
    const nested = prev.state as
      | { routes?: ReadonlyArray<{ name: string }>; index?: number }
      | undefined;
    const active = nested?.routes?.[nested.index ?? 0]?.name;
    if (active === "StatsTab") return "Back to Stats";
  }
  return "Back to Play";
};

/** Back to wherever this screen came from, or to your play when it opened from a link. */
export function BackButton({ label, felt = false }: { label?: string; felt?: boolean } = {}) {
  const navigation = useNavigation();
  const resolved = label ?? backDestinationLabel(navigation.getState?.());
  const goBack = () =>
    navigation.canGoBack()
      ? navigation.goBack()
      : navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } });
  if (Platform.OS === "android")
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resolved}
        hitSlop={8}
        onPress={goBack}
        className="min-h-11 flex-row items-center gap-1.5 pr-2 active:opacity-70"
      >
        <View className="rotate-180">
          <Icon name="arrow-right" color={felt ? "felt-ink" : "ink"} size={20} />
        </View>
        <Text className={cn("type-callout font-medium", felt ? "text-felt-ink" : "text-ink")}>
          {resolved}
        </Text>
      </Pressable>
    );
  return (
    <IconButton
      accessibilityLabel="Back to your play"
      icon={
        <View className="rotate-180">
          <Icon name="arrow-right" color="ink" />
        </View>
      }
      onPress={goBack}
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
  const { showCents, privacyMode } = usePreferences();
  if (privacyMode) {
    return (
      <Text
        testID="live-buy-in"
        accessibilityLabel={HIDDEN_AMOUNT_LABEL}
        numberOfLines={1}
        adjustsFontSizeToFit
        className="text-[88px] leading-[92px] font-bold tracking-[-3px] text-felt-soft tabular-nums"
      >
        {HIDDEN_AMOUNT}
      </Text>
    );
  }
  const text = formatMoney(amount, RECORDING_CURRENCY, {
    trailingZeroDisplay: showCents ? "auto" : "stripIfInteger",
  });
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

function VisitHero({ visit, own }: { visit: RecordingVisitView; own: boolean }) {
  const summary = sessionReadout(visit, visit.visit.finishedAt!);
  return (
    <View className="gap-5 rounded-[22px] bg-surface p-4">
      <View className="gap-1">
        <Text className="type-footnote text-muted">{own ? "Your result" : "Result"}</Text>
        <Money
          amount={visit.finalResult!}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit
          testID="visit-result"
          className="type-hero"
        />
      </View>
      {Platform.OS === "android" ? <View className="h-px bg-line" /> : null}
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

const eventText = (event: RecordingEvent) =>
  event.type === "finished" ? "Finished playing" : `Reopened: ${event.reason}`;

function History({
  visit,
  own = true,
  who = "Their",
  onInspect,
}: {
  visit: RecordingVisitView;
  own?: boolean;
  who?: string;
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
  const prefs = usePreferences();
  const lines = historyLines(visit);
  return (
    <View className="gap-2">
      <SectionHeading count={lines.length === 1 ? "1 entry" : `${lines.length} entries`}>
        {Platform.OS === "android" ? (own ? "Your history" : `${who}'s history`) : "History"}
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
          const name = historyEntryName(visit, item);
          const shownName =
            Platform.OS === "android" && name === "Final cash-out" ? "Cash-out" : name;
          const time = formatTime(item.occurredAt);
          return (
            <Row
              key={item.id}
              onPress={() => onInspect(item.id)}
              accessibilityLabel={`${shownName}, ${formatDisplayMoney(item.amount, RECORDING_CURRENCY, prefs, { forAccessibility: true })}, ${time}${voided ? ", voided" : ""}${item.replacesEntryId ? ", correction" : ""}`}
              accessibilityHint="Shows the entry, where you can correct or void it"
              className="min-h-14"
            >
              <View className={cn("min-w-0 flex-1 gap-0.5", voided && "opacity-50")}>
                <Text
                  className={cn(
                    "text-base font-medium",
                    voided ? "text-muted line-through" : "text-ink",
                  )}
                >
                  {shownName}
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
                className={
                  voided ? "type-number text-muted line-through opacity-50" : "type-number"
                }
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
      title={historyEntryName(visit, entry)}
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

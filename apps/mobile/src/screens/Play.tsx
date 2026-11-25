import {
  CommonActions,
  StackActions,
  useNavigation,
  type StaticScreenProps,
} from "@react-navigation/native";
import { formatDay, formatDuration, formatTime } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { sessionCardModel } from "@stacks/client-runtime/shareCard";
import { cashOutNote, liveTable, tableActions } from "@stacks/client-runtime/liveTable";
import {
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  LIVE_REBUY_AMOUNTS,
  localDateText,
  localTimeText,
  parseStartedAt,
  sessionReadout,
  sessionEditFields,
  RECORDING_CURRENCY,
  UNDONE_REASON,
  visitTitle,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { MinorUnits, VisitId, type EntryId, type Game } from "@stacks/contracts";
import { ownPlayers } from "@stacks/shared/recording";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button, IconButton } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { Icon } from "../components/ui/Icon";
import { FormError } from "../components/ui/Field";
import { HeaderTitle } from "../components/ui/HeaderTitle";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, Skeleton } from "../components/ui/Surface";
import { animate, duration, ease } from "../components/ui/motion";
import { cn } from "../components/ui/cn";
import { confirmAction } from "../components/ui/confirmAction";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { TableNotices } from "../lib/realtime";
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
import { EntryInspector, History } from "../features/VisitHistory";
import { ShareCardSheet } from "../features/ShareCardSheet";
import { TableSection } from "../features/SharedTable";
import { TableTripSheet, TripRow, useTripPickable } from "../features/TableTrip";
import { afterClosing, type OpenSheet } from "../features/visitSheets";
import { withoutTable } from "../lib/tableRoutes";
import {
  ActionSlot,
  LiveClock,
  LiveHero,
  SeatSheet,
  TableActionSheet,
  TableSeats,
  type SlotAction,
  type TableRecorded,
} from "../features/LiveTable";

type Props = StaticScreenProps<{ visitId: string; action?: string }>;

/** One session of your own play, saved on this device. */
export function PlayScreen({ route }: Props) {
  const id = Option.getOrNull(VisitId.makeOption(route.params.visitId));

  return id ? <WatchedVisit visitId={id} action={route.params.action} /> : <Missing />;
}

function WatchedVisit({ visitId, action }: { visitId: VisitId; action?: string }) {
  const { visit } = useRecordingVisit(visitId);

  return (
    <TableNotices tableId={visit?.visit.tableId ?? null}>
      <Visit visitId={visitId} action={action} />
    </TableNotices>
  );
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
            headerTitle: context?.trim() ? headerTitle : undefined,
          }
        : null),
    });
  }, [navigation, children, context, headerTitle]);

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
  const [sharing, setSharing] = useState(false);

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
    clearCashOutAction(navigation);
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

  const canReturn =
    !live &&
    !!table &&
    player !== undefined &&
    !table.visits.some(
      (item) => item.player.id === player.player.id && item.visit.finishedAt === null,
    );

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

  const actions: ReadonlyArray<SlotAction> = live
    ? tableActions(table?.role ?? "participant", { playing: true, closed: false, empty: false })
    : canDelete && visit.finalResult !== null
      ? ["edit", "share_card"]
      : ["edit"];

  const act = (action: SlotAction) =>
    Match.value(action).pipe(
      Match.when("edit", () => setOpen({ type: "edit" })),
      Match.when("share_card", () => setSharing(true)),
      Match.when("delete_table", () => setOpen(null)),
      Match.orElse((next) => setOpen({ type: "action", action: next })),
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
        toast={
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
        <Button
          label="All sessions"
          onPress={() =>
            navigation.navigate("Tabs", {
              screen: "PlayTab",
              params: { screen: "History", initial: false },
            })
          }
        />
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
    <RecordingToast key={saved.entryId} felt={live} onDismiss={() => setSaved(null)}>
      <Text
        className={cn(
          "min-w-0 flex-1 text-sm",
          Platform.OS === "android"
            ? "text-[#F9FAFB]"
            : live
              ? "text-felt-ink"
              : "text-ink-inverse",
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
            variant={live ? "felt" : "secondary"}
            pending={quick.pending}
            size="sm"
            onPress={() => void undo(saved.entryId, saved.visitId)}
          />
        )
      ) : saved.visitId && saved.visitId !== visitId ? (
        Platform.OS === "android" ? null : (
          <Button
            label="Dismiss"
            variant={live ? "felt" : "secondary"}
            size="sm"
            onPress={() => setSaved(null)}
          />
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
          variant={live ? "felt" : "secondary"}
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
      toast={toast}
      dock={
        <>
          <LiveSessionsBar except={visitId} />
          {notice ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl bg-fill px-4 py-2">
              <Text className="text-sm text-ink">{notice}</Text>
            </View>
          ) : null}
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
                      variant="felt"
                      size="lg"
                      haptic
                      disabled={quick.pending}
                      className="min-w-0 flex-1"
                      onPress={() => void rebuy(preset)}
                    />
                  ))}
                  <Button
                    label="Other"
                    variant="felt"
                    size="lg"
                    disabled={quick.pending}
                    className="min-w-0 flex-1"
                    onPress={() => setOpen({ type: "rebuy" })}
                  />
                </View>
              </View>
              <Button
                label="Cash out"
                variant="feltPrimary"
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
              {Platform.OS === "android" ? (
                <View className={stacked ? "gap-2" : "flex-row gap-2"}>
                  <Button
                    label="Undo cash-out"
                    variant="ghost"
                    size="lg"
                    className={cn(!stacked && "flex-1", "border border-line bg-transparent")}
                    onPress={() => setOpen({ type: "reopen" })}
                  />
                  {canReturn ? (
                    <Button
                      label="Back at the table"
                      variant="primary"
                      size="lg"
                      className={stacked ? undefined : "flex-1"}
                      onPress={() => setOpen({ type: "return" })}
                    />
                  ) : null}
                </View>
              ) : (
                <View className="gap-2">
                  {canReturn ? (
                    <Button
                      label="Back at the table"
                      variant="primary"
                      size="lg"
                      onPress={() => setOpen({ type: "return" })}
                    />
                  ) : null}
                  <Button
                    label="Undo cash-out"
                    variant="secondary"
                    size="lg"
                    onPress={() => setOpen({ type: "reopen" })}
                  />
                </View>
              )}
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
          <LiveVisitHero visit={visit} name={own ? undefined : player?.player.displayName} />
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
        />
      ) : open?.type === "history" ? (
        <Sheet open back title={own ? "Your history" : `${name}'s history`} onClose={close}>
          <History
            visit={visit}
            heading={false}
            onInspect={(entryId) => setOpen({ type: "inspect", entryId })}
          />
        </Sheet>
      ) : null}
      {sharing && visit.finalResult !== null ? (
        <ShareCardSheet
          title={visit.venue?.name ?? "Session"}
          onClose={() => setSharing(false)}
          card={(hidden) =>
            sessionCardModel({
              venue: visit.venue?.name ?? null,
              game: visitTitle(visit.table),
              startedAt: visit.visit.startedAt,
              finishedAt: visit.visit.finishedAt!,
              currency: RECORDING_CURRENCY,
              result: visit.finalResult!,
              buyIn: visit.totals.buyIn,
              cashOut: visit.totals.cashOut,
              hourly: sessionReadout(visit, visit.visit.finishedAt!).hourly,
              hidden,
            })
          }
        />
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
        <StartTimeSheet
          visit={visit}
          back
          onClose={close}
          onSaved={() => edited("Start time saved.")}
        />
      ) : open?.type === "game" ? (
        <GameSheet visit={visit} back onClose={close} onSaved={() => edited("Game saved.")} />
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

export function RecordingToast({
  children,
  felt = false,
  onDismiss,
}: {
  children: ReactNode;
  felt?: boolean;
  onDismiss?: () => void;
}) {
  const [shown] = useState(() => new Animated.Value(0));
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    animate(shown, { toValue: 1, duration: duration.toastIn, easing: ease.enter });

    return () => shown.stopAnimation();
  }, [shown]);

  const hasDismiss = Boolean(onDismiss);

  useEffect(() => {
    if (!hasDismiss) return;
    const timer = setTimeout(() => dismiss.current?.(), 6000);

    return () => clearTimeout(timer);
  }, [hasDismiss]);

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
            : cn(
                "gap-2 rounded-xl py-2 pr-2 pl-4 shadow-md",
                felt ? "border border-felt-ink/20 bg-felt-deep" : "bg-ink",
              ),
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
  const tripPickable = useTripPickable(visit.table.tripId !== null);
  const tripRow = showTrip && tripPickable;

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
          {tripRow ? (
            <TripRow value={visit.table.tripId} onPress={() => onOpen({ type: "trip" })} />
          ) : null}
        </List>
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
        {tripRow ? (
          <TripRow value={visit.table.tripId} onPress={() => onOpen({ type: "trip" })} />
        ) : null}
      </List>
      {startError ? <FormError>{startError}</FormError> : null}
      {save.error ? <FormError>{save.error}</FormError> : null}
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
  actions: ReadonlyArray<SlotAction>;
  onAction: (action: SlotAction) => void;
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

  const nested = nestedStack(prev?.state);

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
      <ActionSlot
        felt={live}
        actions={actions}
        onAction={onAction}
        who={who}
        menuLabel={live ? undefined : "Session actions"}
      />
    </View>
  );
}

interface NestedStack {
  readonly routes?: ReadonlyArray<{ readonly name: string }>;
  readonly index?: number;
}

function nestedStack(state: NestedStack | null | undefined) {
  if (state == null || state.routes === undefined) return undefined;

  return state;
}

function clearCashOutAction(navigation: { setParams?: (params: { action: undefined }) => void }) {
  navigation.setParams?.({ action: undefined });
}

const backDestinationLabel = (
  state:
    | { readonly routes?: ReadonlyArray<{ readonly name: string; readonly state?: NestedStack }> }
    | undefined,
) => {
  const routes = state?.routes;
  const prev = routes && routes.length > 1 ? routes[routes.length - 2] : undefined;

  if (!prev) return "Back to your play";

  if (prev.name === "Table") return "Back to the table";

  if (prev.name === "Stats" || prev.name === "StatsTab") return "Back to Stats";

  if (prev.name === "Tabs") {
    const nested = nestedStack(prev.state);

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
      felt={felt}
      accessibilityLabel="Back to your play"
      icon={
        <View className="rotate-180">
          <Icon name="chevron-right" color={felt ? "felt-ink" : "ink"} size={20} />
        </View>
      }
      onPress={goBack}
    />
  );
}

function LiveVisitHero({ visit, name }: { visit: RecordingVisitView; name?: string | undefined }) {
  const summary = sessionReadout(visit, visit.visit.startedAt);

  const buyIns = summary.corrected
    ? "buy-in corrected"
    : `${summary.buyIns} ${summary.buyIns === 1 ? "buy-in" : "buy-ins"}`;

  return (
    <LiveHero
      label={name ? `${name} · Bought in` : "Bought in"}
      amount={visit.totals.buyIn}
      title={[visitTitle(visit.table), visit.venue?.name].filter(Boolean).join(" · ")}
      detail={`Started ${formatTime(visit.visit.startedAt)} · ${buyIns}`}
      testID="live-buy-in"
    />
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

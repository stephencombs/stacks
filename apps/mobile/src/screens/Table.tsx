import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatTime } from "@stacks/client-runtime/format";
import {
  liveTable,
  tableActions,
  type TableAction,
  type TableSeat,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingSubmit,
  useRecordingTable,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  RECORDING_CURRENCY,
  tableTitle,
  UNDONE_REASON,
} from "@stacks/client-runtime/recordingView";
import { TableId, type EntryId, type SeatingId, type VisitId } from "@stacks/contracts";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { useLayoutEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { FormError } from "../components/ui/Field";
import { EmptyState } from "../components/ui/Surface";
import { LiveSessionsBar } from "../features/LiveBar";
import {
  ActionSlot,
  LiveClock,
  LiveHero,
  SeatSheet,
  TableActionSheet,
  TableSeats,
  useDeleteTable,
  type TableRecorded,
} from "../features/LiveTable";
import { PersonalScreen } from "../features/Personal";
import { SitDownSheet } from "../features/RecordingForms";
import { useAccount } from "../lib/account";
import { TableNotices } from "../lib/realtime";
import { useRecordingState } from "../lib/recording";
import { StacksProvider } from "../lib/stacks";
import { BackButton, RecordingToast } from "./Play";
import { ImportedSession } from "./Session";

type Props = StaticScreenProps<{ tableId: string }>;

/**
 * A table you record at without a visit in play: one you opened without playing, or one you cashed
 * out of while others play. What's in play leads, then everyone at the table.
 */
export function TableScreen({ route }: Props) {
  const id = Option.getOrNull(TableId.makeOption(route.params.tableId));

  return id ? (
    <TableNotices tableId={id}>
      <Table tableId={id} />
    </TableNotices>
  ) : (
    <Missing />
  );
}

function Missing() {
  const navigation = useNavigation();

  return (
    <PersonalScreen>
      <EmptyState
        title="This table isn't on this device"
        action={
          <Button
            label="Back to your play"
            variant="primary"
            size="lg"
            className="mt-2 self-start"
            onPress={() =>
              navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } })
            }
          />
        }
      >
        Tables are saved on the devices that record them.
      </EmptyState>
    </PersonalScreen>
  );
}

function HideNativeHeader() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });

    return () => navigation.setOptions({ headerShown: true });
  }, [navigation]);

  return null;
}

type Open =
  | { readonly type: "sit" }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit" | "delete_table"> }
  | { readonly type: "seat"; readonly seat: TableSeat };

function Table({ tableId }: { tableId: TableId }) {
  const table = useRecordingTable(tableId);
  const server = useServerTable(tableId);
  const state = useRecordingState();
  const account = useAccount();
  const navigation = useNavigation();
  const quick = useRecordingSubmit();
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<(TableRecorded & { readonly key: string }) | null>(null);

  const deletion = useDeleteTable(tableId, () =>
    navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } }),
  );

  if (state === null) return <PersonalScreen>{null}</PersonalScreen>;
  const signedIn = account.available && account.isSignedIn;

  if (!table) {
    if (server?.legacySessionId && signedIn) {
      return (
        <StacksProvider>
          <ImportedSession sessionId={server.legacySessionId} table={server} />
        </StacksProvider>
      );
    }

    if (signedIn && server === undefined) return <PersonalScreen>{null}</PersonalScreen>;

    return <Missing />;
  }

  const view = liveTable(table, server);
  const close = () => setOpen(null);
  const toVisit = (visitId: VisitId) => navigation.dispatch(StackActions.push("Play", { visitId }));

  const recorded = ({ entryId, ...rest }: TableRecorded) => {
    close();

    if (entryId || rest.seatingId)
      setSaved(entryId ? { key: entryId, entryId, ...rest } : { key: rest.seatingId!, ...rest });
    else {
      setSaved(null);
      setNotice(rest.text);
    }
  };

  const undo = async ({
    entryId,
    seatingId,
    tableId: undoTableId,
    visitId,
  }: {
    entryId?: EntryId;
    seatingId?: SeatingId;
    tableId?: TableId;
    visitId: VisitId;
  }) => {
    if (seatingId && undoTableId) {
      const receipt = await quick.submit({
        type: "void_seating",
        tableId: undoTableId,
        visitId,
        seatingId,
        reason: UNDONE_REASON,
      });

      if (receipt) {
        setSaved(null);
        setNotice("Seat change undone.");
      }

      return;
    }

    if (!entryId) return;

    const receipt = await quick.submit({
      type: "correct",
      visitId,
      entryId,
      reason: UNDONE_REASON,
      replacement: null,
    });

    if (receipt) {
      setSaved(null);
      setNotice("Rebuy undone. It stays in the history, voided.");
    }
  };

  const actions = tableActions(table.role, {
    playing: false,
    closed: view.closed,
    empty: view.seats.length === 0,
  });

  const venue = state.venues.find((item) => item.id === table.table.venueId);
  const title = [tableTitle(table.table), venue?.name].filter(Boolean).join(" · ");
  const started = view.startedAt ? `Started ${formatTime(view.startedAt)}` : null;

  return (
    <PersonalScreen
      session
      felt={!view.closed}
      toast={
        saved ? (
          <RecordingToast key={saved.key} felt={!view.closed} onDismiss={() => setSaved(null)}>
            <Text
              className={cn(
                "min-w-0 flex-1 text-sm",
                Platform.OS === "android"
                  ? "text-[#F9FAFB]"
                  : view.closed
                    ? "text-ink-inverse"
                    : "text-felt-ink",
              )}
            >
              {saved.text}
            </Text>
            {saved.undo ? (
              Platform.OS === "android" ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={quick.pending}
                  onPress={() => void undo(saved)}
                  className="px-2 py-1 active:opacity-70"
                >
                  <Text className="type-callout font-semibold text-[#6EE7B7]">Undo</Text>
                </Pressable>
              ) : (
                <Button
                  label="Undo"
                  variant={view.closed ? "secondary" : "felt"}
                  size="sm"
                  pending={quick.pending}
                  onPress={() => void undo(saved)}
                />
              )
            ) : null}
            {Platform.OS === "android" ? null : (
              <Button
                label="Dismiss"
                variant={view.closed ? "secondary" : "felt"}
                size="sm"
                onPress={() => setSaved(null)}
              />
            )}
          </RecordingToast>
        ) : undefined
      }
      dock={
        <>
          <LiveSessionsBar except={tableId} />
          {notice ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl bg-fill px-4 py-2">
              <Text className="text-sm text-ink">{notice}</Text>
            </View>
          ) : null}
          {quick.error ? <FormError>{quick.error}</FormError> : null}
          {deletion.error ? <FormError>{deletion.error}</FormError> : null}
          {table.you.playing ? (
            <Button
              label="Back to your session"
              variant={view.closed ? "primary" : "feltPrimary"}
              size="lg"
              onPress={() => toVisit(table.you.playing!)}
            />
          ) : view.closed ? null : (
            <Button
              label="Sit down and play"
              variant="feltPrimary"
              size="lg"
              onPress={() => setOpen({ type: "sit" })}
            />
          )}
        </>
      }
    >
      <HideNativeHeader />
      <View className="flex-row items-center justify-between gap-3">
        <BackButton felt={!view.closed} />
        {view.closed ? (
          <Text accessibilityRole="header" className="type-headline text-ink">
            Finished
          </Text>
        ) : (
          <LiveClock since={view.startedAt} />
        )}
        <ActionSlot
          felt={!view.closed}
          actions={actions}
          onAction={(action) =>
            Match.value(action).pipe(
              Match.when("delete_table", () => deletion.confirm()),
              Match.when("edit", () => undefined),
              Match.orElse((next) => setOpen({ type: "action", action: next })),
            )
          }
        />
      </View>
      {!view.closed ? (
        <LiveHero
          label="In play at the table"
          amount={view.inPlay}
          title={title}
          detail={
            view.seats.length === 0
              ? "Nobody's playing yet"
              : [started, Platform.OS === "android" ? `${view.playing} playing` : null]
                  .filter(Boolean)
                  .join(" · ")
          }
        />
      ) : (
        <View className="items-center gap-3 pt-12">
          <Text accessibilityRole="header" className="type-body font-medium text-muted">
            In play at the table
          </Text>
          <Money
            amount={view.inPlay}
            currency={RECORDING_CURRENCY}
            fit
            className="w-full text-center text-7xl leading-[88px]"
          />
          <Text className="mt-3 text-center type-headline text-ink">{title}</Text>
          <Text className="text-center type-footnote text-muted">
            {view.seats.length === 0 ? "Nobody's playing yet" : "Everyone has cashed out"}
          </Text>
        </View>
      )}
      {view.seats.length === 0 ? (
        <View className="rounded-2xl bg-felt-deep px-4 py-3">
          <Text className="type-footnote text-felt-soft">
            {!actions.includes("add_player")
              ? "Nobody has bought in here yet."
              : actions.includes("share")
                ? "Add the players here from the menu, or share the table so they record their own."
                : "Add the players here from the menu."}
          </Text>
        </View>
      ) : (
        <TableSeats
          table={view}
          felt={!view.closed}
          onSeat={(seat) => setOpen({ type: "seat", seat })}
          onSelf={toVisit}
        />
      )}
      {Match.value(open).pipe(
        Match.when({ type: "sit" }, () => (
          <SitDownSheet
            tableId={tableId}
            player={table.you.player}
            returning={table.visits.some((item) => item.isSelf)}
            onClose={close}
            onSeated={(visitId) => {
              close();
              navigation.dispatch(StackActions.replace("Play", { visitId }));
            }}
          />
        )),
        Match.when({ type: "action" }, (sheet) => (
          <TableActionSheet
            action={sheet.action}
            table={table}
            onClose={close}
            onAdded={(name) => {
              close();
              setSaved(null);
              setNotice(`${name} is at the table.`);
            }}
          />
        )),
        Match.when({ type: "seat" }, (sheet) => (
          <SeatSheet
            seat={sheet.seat}
            table={view}
            onClose={close}
            onRecorded={recorded}
            onSeated={(_, name) =>
              recorded({ visitId: sheet.seat.visitId, text: `${name} is back at the table.` })
            }
          />
        )),
        Match.orElse(() => null),
      )}
    </PersonalScreen>
  );
}

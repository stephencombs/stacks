import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
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
import { RECORDING_CURRENCY, tableTitle } from "@stacks/client-runtime/recordingView";
import { TableId, type EntryId, type VisitId } from "@stacks/contracts";
import * as Option from "effect/Option";
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { FormError } from "../components/ui/Field";
import { EmptyState } from "../components/ui/Surface";
import { LiveSessionsBar } from "../features/LiveBar";
import {
  ActionSlot,
  LiveClock,
  SeatSheet,
  TableActionSheet,
  TableSeats,
  useDeleteTable,
  type TableRecorded,
} from "../features/LiveTable";
import { PersonalScreen } from "../features/Personal";
import { SitDownSheet } from "../features/RecordingForms";
import { useRecordingState } from "../lib/recording";
import { BackButton, RecordingToast } from "./Play";

type Props = StaticScreenProps<{ tableId: string }>;

/**
 * A table you record at without a visit in play: one you opened without playing, or one you cashed
 * out of while others play. What's in play leads, then everyone at the table.
 */
export function TableScreen({ route }: Props) {
  const id = Option.getOrNull(TableId.makeOption(route.params.tableId));
  return id ? <Table tableId={id} /> : <Missing />;
}

function Missing() {
  return (
    <PersonalScreen>
      <EmptyState title="This table isn't on this device">
        Tables are saved on the devices that record them.
      </EmptyState>
    </PersonalScreen>
  );
}

type Open =
  | { readonly type: "sit" }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit" | "delete_table"> }
  | { readonly type: "seat"; readonly seat: TableSeat };

function Table({ tableId }: { tableId: TableId }) {
  const table = useRecordingTable(tableId);
  const server = useServerTable(tableId);
  const state = useRecordingState();
  const navigation = useNavigation();
  const quick = useRecordingSubmit();
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<(TableRecorded & { entryId: EntryId }) | null>(null);
  const deletion = useDeleteTable(tableId, () =>
    navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } }),
  );
  if (state === null) return <PersonalScreen session>{null}</PersonalScreen>;
  if (!table) return <Missing />;
  const view = liveTable(table, server);
  const close = () => setOpen(null);
  const toVisit = (visitId: VisitId) => navigation.dispatch(StackActions.push("Play", { visitId }));
  const recorded = ({ entryId, ...rest }: TableRecorded) => {
    close();
    if (entryId) setSaved({ entryId, ...rest });
    else {
      setSaved(null);
      setNotice(rest.text);
    }
  };
  const undo = async ({ entryId, visitId }: { entryId: EntryId; visitId: VisitId }) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId,
      entryId,
      reason: "Undone",
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
  const soft = view.closed ? "text-muted" : "text-felt-soft";
  const ink = view.closed ? "text-ink" : "text-felt-ink";
  return (
    <PersonalScreen
      session
      felt={!view.closed}
      dock={
        <>
          <LiveSessionsBar except={tableId} />
          {notice ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl bg-fill px-4 py-2">
              <Text className="text-sm text-ink">{notice}</Text>
            </View>
          ) : null}
          {saved ? (
            <RecordingToast key={saved.entryId}>
              <Text className="min-w-0 flex-1 text-sm text-ink-inverse">{saved.text}</Text>
              {saved.undo ? (
                <Button
                  label="Undo"
                  size="sm"
                  pending={quick.pending}
                  onPress={() => void undo(saved)}
                />
              ) : null}
              <Button label="Dismiss" size="sm" onPress={() => setSaved(null)} />
            </RecordingToast>
          ) : null}
          {quick.error ? <FormError>{quick.error}</FormError> : null}
          {deletion.error ? <FormError>{deletion.error}</FormError> : null}
          {table.you.playing ? (
            <Button
              label="Back to your session"
              variant="primary"
              size="lg"
              onPress={() => toVisit(table.you.playing!)}
            />
          ) : view.closed ? null : (
            <Button
              label="Sit down and play"
              variant="primary"
              size="lg"
              onPress={() => setOpen({ type: "sit" })}
            />
          )}
        </>
      }
    >
      <View className="flex-row items-center justify-between gap-3">
        <BackButton />
        {view.closed ? (
          <Text accessibilityRole="header" className="type-headline text-ink">
            Finished
          </Text>
        ) : (
          <LiveClock since={view.startedAt} />
        )}
        <ActionSlot
          actions={actions}
          onAction={(action) =>
            action === "delete_table"
              ? deletion.confirm()
              : action === "edit"
                ? undefined
                : setOpen({ type: "action", action })
          }
        />
      </View>
      <View className="items-center gap-3 pt-12">
        <Text accessibilityRole="header" className={cn("type-body font-medium", soft)}>
          In play at the table
        </Text>
        <Money
          amount={view.inPlay}
          currency={RECORDING_CURRENCY}
          fit
          className={cn("w-full text-center text-7xl leading-[88px]", ink)}
        />
        <Text className={cn("mt-3 text-center type-headline", ink)}>
          {[tableTitle(table.table), venue?.name].filter(Boolean).join(" · ")}
        </Text>
        <Text className={cn("text-center type-footnote", soft)}>
          {view.seats.length === 0
            ? "Nobody's playing yet"
            : view.closed
              ? "Everyone has cashed out"
              : `${view.playing} playing`}
        </Text>
      </View>
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
          count={false}
          onSeat={(seat) => setOpen({ type: "seat", seat })}
          onSelf={toVisit}
        />
      )}
      {open?.type === "sit" ? (
        <SitDownSheet
          tableId={tableId}
          player={table.you.player}
          onClose={close}
          onSeated={(visitId) => {
            close();
            navigation.dispatch(StackActions.replace("Play", { visitId }));
          }}
        />
      ) : open?.type === "action" ? (
        <TableActionSheet
          action={open.action}
          table={table}
          onClose={close}
          onAdded={(name) => {
            close();
            setSaved(null);
            setNotice(`${name} is at the table.`);
          }}
        />
      ) : open?.type === "seat" ? (
        <SeatSheet
          seat={open.seat}
          table={view}
          onClose={close}
          onRecorded={recorded}
          onSeated={(_, name) =>
            recorded({ visitId: open.seat.visitId, text: `${name} is back at the table.` })
          }
          onHistory={(visitId) => {
            close();
            toVisit(visitId);
          }}
        />
      ) : null}
    </PersonalScreen>
  );
}

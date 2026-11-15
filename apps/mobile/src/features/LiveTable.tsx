import {
  cashOutNote,
  type LiveTable,
  type TableAction,
  type TableSeat,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingClock,
  useRecordingSubmit,
  useRecordingVisit,
} from "@stacks/client-runtime/recordingReact";
import {
  elapsedClock,
  LIVE_REBUY_AMOUNTS,
  RECORDING_CURRENCY,
  type RecordingTableView,
} from "@stacks/client-runtime/recordingView";
import {
  MinorUnits,
  PlayerIdentity,
  type EntryId,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button, IconButton } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { confirmAction } from "../components/ui/confirmAction";
import { FormError } from "../components/ui/Field";
import { GlassSurface } from "../components/ui/GlassSurface";
import { Icon, type IconName } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import {
  AddPlayerSheet,
  CashOutSheet,
  RebuySheet,
  ReopenSheet,
  SitDownSheet,
} from "./RecordingForms";
import { ShareSheet, TableSettingsSheet } from "./SharedTable";

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/** The LIVE pill, timing the table from its first visit. With nobody there yet, it has no time. */
export function LiveClock({ since }: { since: DateTime.Utc | null }) {
  const now = useRecordingClock();
  return (
    <GlassSurface radius={22} className="min-h-11 flex-row items-center gap-2 rounded-full px-4">
      <View className="size-2 rounded-full bg-live" />
      <Text className="type-footnote font-semibold text-ink">LIVE</Text>
      {since ? (
        <Text className="type-callout font-semibold text-ink tabular-nums">
          {elapsedClock(since, now)}
        </Text>
      ) : null}
    </GlassSurface>
  );
}

/** What a write from the table did, for the screen's toast. */
export type TableRecorded = {
  readonly visitId: VisitId;
  readonly entryId?: EntryId;
  readonly text: string;
  /** A rebuy, which the toast can undo. */
  readonly undo?: boolean;
};

/**
 * Everyone at the table on the felt, under your own session: who's playing first, then who cashed
 * out, faded. A row opens that player's sheet when this device records for them, and your own
 * opens your session when it isn't the one on screen.
 */
export function TableSeats({
  table,
  current,
  felt = true,
  count = true,
  onSeat,
  onSelf,
}: {
  table: LiveTable;
  current?: VisitId;
  felt?: boolean;
  /** Says how many are playing, unless the screen already does. */
  count?: boolean;
  onSeat: (seat: TableSeat) => void;
  onSelf: (visitId: VisitId) => void;
}) {
  if (table.seats.length === 0) return null;
  const soft = felt ? "text-felt-soft" : "text-muted";
  const ink = felt ? "text-felt-ink" : "text-ink";
  return (
    <View className="gap-2">
      <View className="flex-row justify-between">
        <Text accessibilityRole="header" className={cn("type-footnote font-medium", soft)}>
          At this table
        </Text>
        {count ? (
          <Text className={cn("type-footnote", soft)}>
            {table.playing === 1 ? "1 playing" : `${table.playing} playing`}
          </Text>
        ) : null}
      </View>
      <View className={cn("overflow-hidden rounded-2xl", felt ? "bg-felt-deep" : "bg-surface")}>
        {table.seats.map((seat, index) => {
          const self = seat.isSelf && seat.visitId !== current;
          const press = self
            ? () => onSelf(seat.visitId)
            : seat.recordable
              ? () => onSeat(seat)
              : undefined;
          const body = (
            <>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className={cn("type-body font-medium", ink)}>
                  {seat.name}
                </Text>
                <Text className={cn("type-footnote", soft)}>{seat.status}</Text>
              </View>
              <Money
                amount={seat.amount}
                currency={RECORDING_CURRENCY}
                tone={seat.playing ? "plain" : "result"}
                className={cn("font-semibold", felt && "text-felt-ink")}
              />
              {press ? (
                <Icon name="chevron-right" color={felt ? "felt-soft" : "muted"} size={16} />
              ) : null}
            </>
          );
          const row = cn(
            "min-h-16 flex-row items-center gap-3 px-4 py-3",
            index > 0 && (felt ? "border-t border-felt-ink/10" : "border-t border-line"),
            !seat.playing && "opacity-60",
          );
          return press ? (
            <Pressable
              key={seat.visitId}
              accessibilityRole="button"
              accessibilityLabel={`${seat.name}, ${seat.status}`}
              accessibilityHint={self ? "Opens your session" : "Records for them"}
              onPress={press}
              className={cn(row, felt ? "active:bg-felt" : "active:bg-fill")}
            >
              {body}
            </Pressable>
          ) : (
            <View key={seat.visitId} className={row}>
              {body}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const actionLabels: Record<TableAction, string> = {
  edit: "Edit my session",
  add_player: "Add player",
  share: "Share table",
  settings: "Table settings",
  delete_table: "Delete table",
};
const actionIcons: Record<TableAction, IconName> = {
  edit: "edit",
  add_player: "add-person",
  share: "share",
  settings: "settings",
  delete_table: "trash",
};

/** The top-right slot: nothing, the one thing you can do, or a menu of several. */
export function ActionSlot({
  actions,
  onAction,
}: {
  actions: ReadonlyArray<TableAction>;
  onAction: (action: TableAction) => void;
}) {
  const [only] = actions;
  if (!only) return <View className="size-11" />;
  if (actions.length === 1)
    return (
      <IconButton
        accessibilityLabel={actionLabels[only]}
        icon={<Icon name={actionIcons[only]} color="ink" />}
        onPress={() => onAction(only)}
      />
    );
  return (
    <ActionMenu
      label="Table actions"
      actions={actions.map((action) => ({
        label: actionLabels[action],
        icon: actionIcons[action],
        destructive: action === "delete_table",
        onPress: () => onAction(action),
      }))}
    />
  );
}

/** The table's own sheets behind the action slot: everything but editing your session. */
export function TableActionSheet({
  action,
  table,
  onClose,
  onAdded,
}: {
  action: Exclude<TableAction, "edit" | "delete_table">;
  table: RecordingTableView;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const tableId = table.table.id;
  switch (action) {
    case "add_player":
      return (
        <AddPlayerSheet
          tableId={tableId}
          saved={table.addable}
          onClose={onClose}
          onAdded={(_, name) => onAdded(name)}
        />
      );
    case "share":
      return <ShareSheet tableId={tableId} onClose={onClose} />;
    case "settings":
      return <TableSettingsSheet tableId={tableId} onClose={onClose} />;
  }
}

/** Asks, then deletes a table nobody has played at. */
export function useDeleteTable(tableId: TableId, onDeleted: () => void) {
  const save = useRecordingSubmit();
  return {
    error: save.error,
    confirm: () =>
      confirmAction(
        "Delete this table?",
        "Nobody has played here, so no play is lost. Its link stops working.",
        "Delete table",
        () => {
          void (async () => {
            if (await save.submit({ type: "delete_table", tableId })) onDeleted();
          })();
        },
      ),
  };
}

type SeatStep = "menu" | "rebuy" | "cash_out" | "reopen" | "return";

/**
 * Another player's sheet, for whoever records for everyone here: a rebuy or cash-out while they
 * play, or, once they've cashed out, undoing it or sitting them back down.
 */
export function SeatSheet({
  seat,
  table,
  onClose,
  onRecorded,
  onSeated,
  onHistory,
}: {
  seat: TableSeat;
  table: LiveTable;
  onClose: () => void;
  onRecorded: (recorded: TableRecorded) => void;
  onSeated: (visitId: VisitId, name: string) => void;
  onHistory: (visitId: VisitId) => void;
}) {
  const { visit } = useRecordingVisit(seat.visitId);
  const quick = useRecordingSubmit();
  const [step, setStep] = useState<SeatStep>("menu");
  if (!visit) return null;
  const back = () => setStep("menu");
  if (step === "rebuy")
    return (
      <RebuySheet
        visit={visit}
        who={seat.name}
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            undo: true,
            text: `Rebuy of ${money(input.type === "add" ? input.amount : 0)} for ${seat.name} recorded.`,
          })
        }
      />
    );
  if (step === "cash_out")
    return (
      <CashOutSheet
        visit={visit}
        who={seat.name}
        note={cashOutNote(table.seats, seat.visitId)}
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            text: `${seat.name} cashed out ${money(input.type === "finish" ? input.amount : 0)}.`,
          })
        }
      />
    );
  if (step === "reopen")
    return (
      <ReopenSheet
        visit={visit}
        onClose={back}
        onReopened={() =>
          onRecorded({ visitId: seat.visitId, text: `${seat.name} is playing again.` })
        }
      />
    );
  if (step === "return")
    return (
      <SitDownSheet
        tableId={visit.visit.tableId}
        player={PlayerIdentity.make({ id: seat.playerId, displayName: seat.name })}
        onClose={back}
        onSeated={(next) => onSeated(next, seat.name)}
      />
    );
  const rebuy = async (amount: number) => {
    const receipt = await quick.submit({
      type: "add",
      visitId: seat.visitId,
      kind: "buy_in",
      amount,
    });
    if (receipt?.command.type === "add")
      onRecorded({
        visitId: seat.visitId,
        entryId: receipt.command.entryId,
        undo: true,
        text: `Rebuy of ${money(amount)} for ${seat.name} recorded.`,
      });
  };
  const playingAgain = table.seats.some(
    (item) => item.playerId === seat.playerId && item.playing && item.visitId !== seat.visitId,
  );
  return (
    <Sheet open busy={quick.pending} title={seat.name} description={seat.status} onClose={onClose}>
      <View className="flex-row items-baseline justify-between gap-3 rounded-xl bg-surface p-4">
        <Text className="type-footnote text-muted">{seat.playing ? "Bought in" : "Result"}</Text>
        <Money
          amount={seat.amount}
          currency={RECORDING_CURRENCY}
          tone={seat.playing ? "plain" : "result"}
          className="type-title"
        />
      </View>
      {seat.playing ? (
        <>
          <View
            className="flex-row gap-2"
            accessibilityRole="toolbar"
            accessibilityLabel={`Rebuy for ${seat.name}`}
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
              onPress={() => setStep("rebuy")}
            />
          </View>
          <Button
            label={`Cash out ${seat.name}`}
            variant="primary"
            size="lg"
            haptic
            disabled={quick.pending}
            onPress={() => setStep("cash_out")}
          />
        </>
      ) : (
        <View className="flex-row gap-2">
          <Button
            label="Undo cash-out"
            size="lg"
            className="flex-1"
            onPress={() => setStep("reopen")}
          />
          {playingAgain ? null : (
            <Button
              label="Back at the table"
              variant="primary"
              size="lg"
              className="flex-1"
              onPress={() => setStep("return")}
            />
          )}
        </View>
      )}
      {quick.error ? <FormError>{quick.error}</FormError> : null}
      <Button
        label={`${seat.name}'s history`}
        variant="ghost"
        onPress={() => onHistory(seat.visitId)}
      />
    </Sheet>
  );
}

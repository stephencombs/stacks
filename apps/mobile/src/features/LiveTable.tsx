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
import { shortName } from "@stacks/client-runtime/format";
import { tableChipOf } from "@stacks/client-runtime/trip";
import { formatMoney } from "@stacks/shared/money";
import type * as DateTime from "effect/DateTime";
import { use, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button, IconButton } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { confirmAction } from "../components/ui/confirmAction";
import { FormError } from "../components/ui/Field";
import { GlassSurface } from "../components/ui/GlassSurface";
import { Icon, type IconName } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { InSheet } from "../components/ui/sheetContext";
import { formatDisplayMoney, HIDDEN_AMOUNT, usePreferences } from "../lib/preferences";
import {
  AddPlayerSheet,
  CashOutSheet,
  RebuySheet,
  ReopenSheet,
  SitDownSheet,
} from "./RecordingForms";
import { ContactPhotoControls } from "./ContactPhoto";
import { TableChip } from "./PlayerChip";
import { ShareSheet, TableSettingsSheet } from "./SharedTable";

const money = (amount: number, showCents = false) =>
  formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY, {
    trailingZeroDisplay: showCents ? "auto" : "stripIfInteger",
  });

/** The LIVE pill, timing the table from its first visit. With nobody there yet, it has no time. */
export function LiveClock({ since }: { since: DateTime.Utc | null }) {
  const now = useRecordingClock();

  if (Platform.OS === "android")
    return (
      <View className="min-h-10 flex-row items-center gap-2 rounded-full bg-black/15 px-4">
        <View className="size-2 rounded-full bg-felt-ink" />
        <Text className="type-footnote font-semibold text-felt-ink">LIVE</Text>
        {since ? (
          <Text className="type-callout font-semibold text-felt-ink tabular-nums">
            {elapsedClock(since, now)}
          </Text>
        ) : null}
      </View>
    );

  return (
    <GlassSurface radius={22} felt className="h-11 flex-row items-center gap-2 rounded-full px-4">
      <View className="size-2 rounded-full bg-felt-ink" />
      <Text className="type-footnote font-semibold text-felt-ink">LIVE</Text>
      {since ? (
        <Text className="type-callout font-semibold text-felt-ink tabular-nums">
          {elapsedClock(since, now)}
        </Text>
      ) : null}
    </GlassSurface>
  );
}

export function LiveHero({
  label,
  amount,
  title,
  detail,
  testID,
}: {
  label: string;
  amount: MinorUnits;
  title: string;
  detail: string;
  testID?: string;
}) {
  return (
    <View className="gap-2.5 px-3 pt-16">
      <Text accessibilityRole="header" className="type-label text-[13px] text-felt-ink">
        {label}
      </Text>
      <Money
        amount={amount}
        currency={RECORDING_CURRENCY}
        felt
        fit
        testID={testID}
        className="text-[88px] leading-[92px] font-bold tracking-[-3px]"
      />
      <Text className="type-heading font-medium text-felt-ink">{title}</Text>
      <Text className="type-footnote text-felt-soft">{detail}</Text>
    </View>
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
  onSeat,
  onSelf,
}: {
  table: LiveTable;
  current?: VisitId;
  felt?: boolean;
  onSeat: (seat: TableSeat) => void;
  onSelf: (visitId: VisitId) => void;
}) {
  const prefs = usePreferences();
  const androidFelt = Platform.OS === "android" && felt;

  const seats =
    androidFelt && current ? table.seats.filter((seat) => seat.visitId !== current) : table.seats;

  if (seats.length === 0) return null;
  const soft = felt ? "text-felt-soft" : "text-muted";
  const ink = felt ? "text-felt-ink" : "text-ink";

  return (
    <View className="gap-2">
      {androidFelt ? null : (
        <View className="flex-row justify-between">
          <Text accessibilityRole="header" className={cn("type-footnote font-medium", soft)}>
            At this table
          </Text>
          {felt ? (
            <Text className="type-footnote text-felt-soft">{table.playing} playing</Text>
          ) : null}
        </View>
      )}
      <View
        className={cn(
          !androidFelt && "overflow-hidden rounded-2xl",
          !androidFelt && (felt ? "bg-felt-deep" : "bg-surface"),
        )}
      >
        {seats.map((seat, index) => {
          const self = seat.isSelf && seat.visitId !== current;

          const press = self
            ? () => onSelf(seat.visitId)
            : seat.recordable
              ? () => onSeat(seat)
              : undefined;

          const status = prefs.privacyMode
            ? seat.status.replace(/\$[0-9,.]+/, HIDDEN_AMOUNT)
            : seat.status;

          const body = (
            <>
              <TableChip playerId={seat.playerId} name={seat.name} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className={cn("type-body font-medium", ink)}>
                  {seat.name}
                </Text>
                <Text className={cn("type-footnote", soft)}>{status}</Text>
              </View>
              <Money
                amount={seat.amount}
                currency={RECORDING_CURRENCY}
                tone={seat.playing ? "plain" : "result"}
                felt={felt}
                className="type-number"
              />
              {press ? (
                <Icon name="chevron-right" color={felt ? "felt-soft" : "muted"} size={16} />
              ) : null}
            </>
          );

          const row = cn(
            "min-h-16 flex-row items-center gap-3 py-3",
            androidFelt ? "px-3" : "px-4",
            (androidFelt || index > 0) &&
              (felt ? "border-t border-felt-ink/15" : "border-t border-line"),
            !seat.playing && "opacity-60",
          );

          return press ? (
            <Pressable
              key={seat.visitId}
              accessibilityRole="button"
              accessibilityLabel={`${seat.name}, ${status}`}
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

/** What the slot can offer: a table action, or sharing a finished session as a card. */
export type SlotAction = TableAction | "share_card";

const actionLabels: Record<SlotAction, string> = {
  edit: "Edit my session",
  add_player: "Add player",
  share: "Share table",
  settings: "Table settings",
  delete_table: "Delete table",
  share_card: "Share card",
};

const actionIcons: Record<SlotAction, IconName> = {
  edit: "edit",
  add_player: "add-person",
  share: "share",
  settings: "settings",
  delete_table: "trash",
  share_card: "share",
};

/** The top-right slot: nothing, the one thing you can do, or a menu of several. */
export function ActionSlot<A extends SlotAction = TableAction>({
  actions,
  onAction,
  who,
  felt = false,
  menuLabel = "Table actions",
}: {
  actions: ReadonlyArray<A>;
  onAction: (action: A) => void;
  /** Whose session this is, when it isn't yours: "Priya". */
  who?: string | undefined;
  felt?: boolean;
  menuLabel?: string;
}) {
  const label = (action: A) =>
    action === "edit" && who ? `Edit ${who}'s session` : actionLabels[action];

  const [only] = actions;

  if (!only) return <View className="size-11" />;

  if (actions.length === 1)
    return (
      <IconButton
        plain={!felt && Platform.OS === "android"}
        felt={felt}
        accessibilityLabel={label(only)}
        icon={<Icon name={actionIcons[only]} color={felt ? "felt-ink" : "ink"} />}
        onPress={() => onAction(only)}
      />
    );

  return (
    <ActionMenu
      label={menuLabel}
      felt={felt}
      vertical={Platform.OS === "android"}
      actions={actions.map((action) => ({
        label: label(action),
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
  const inSheet = use(InSheet);
  const prefs = usePreferences();
  const quick = useRecordingSubmit();
  const [step, setStep] = useState<SeatStep>("menu");

  if (!visit) return null;

  const shown = (amount: number) =>
    formatDisplayMoney(MinorUnits.make(amount), RECORDING_CURRENCY, prefs);

  const back = () => setStep("menu");

  if (step === "rebuy")
    return (
      <RebuySheet
        visit={visit}
        who={seat.name}
        back
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            undo: true,
            text: `Rebuy of ${shown(input.type === "add" ? input.amount : 0)} for ${seat.name} recorded.`,
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
        back
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            text: `${seat.name} cashed out ${shown(input.type === "finish" ? input.amount : 0)}.`,
          })
        }
      />
    );

  if (step === "reopen")
    return (
      <ReopenSheet
        visit={visit}
        back
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
        back
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
        text: `Rebuy of ${shown(amount)} for ${seat.name} recorded.`,
      });
  };

  const playingAgain = table.seats.some(
    (item) => item.playerId === seat.playerId && item.playing && item.visitId !== seat.visitId,
  );

  return (
    <Sheet
      open
      busy={quick.pending}
      title={shortName(seat.name)}
      description={seat.status}
      onClose={onClose}
    >
      <View
        className={cn(
          "flex-row items-baseline justify-between gap-3 rounded-xl p-4",
          inSheet ? "bg-raised" : "bg-surface",
        )}
      >
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
                label={`+ ${money(preset, prefs.showCents)}`}
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
            label={`Cash out ${shortName(seat.name)}`}
            variant="primary"
            size="lg"
            haptic
            disabled={quick.pending}
            onPress={() => setStep("cash_out")}
          />
        </>
      ) : Platform.OS === "android" ? (
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
      ) : (
        <View className="gap-2">
          {playingAgain ? null : (
            <Button
              label="Back at the table"
              variant="primary"
              size="lg"
              onPress={() => setStep("return")}
            />
          )}
          <Button
            label="Undo cash-out"
            variant="secondary"
            size="lg"
            onPress={() => setStep("reopen")}
          />
        </View>
      )}
      {quick.error ? <FormError>{quick.error}</FormError> : null}
      <ContactPhotoControls
        playerId={seat.playerId}
        chip={tableChipOf(seat.playerId)}
        name={seat.name}
      />
      <Button
        label={`${shortName(seat.name)}'s history`}
        variant="ghost"
        onPress={() => onHistory(seat.visitId)}
      />
    </Sheet>
  );
}

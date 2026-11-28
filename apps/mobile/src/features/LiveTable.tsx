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
  formatSeatLabel,
  LIVE_REBUY_AMOUNTS,
  RECORDING_CURRENCY,
  type RecordingTableView,
} from "@stacks/client-runtime/recordingView";
import {
  MinorUnits,
  PlayerIdentity,
  type EntryId,
  type SeatingId,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import { formatTime, shortName } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
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
import { Card, List, Row } from "../components/ui/Surface";
import { formatDisplayMoney, HIDDEN_AMOUNT, usePreferences } from "../lib/preferences";
import {
  AddPlayerSheet,
  CashOutSheet,
  CorrectSheet,
  RebuySheet,
  ReopenSheet,
  SitDownSheet,
  VoidSeatingSheet,
  VoidSheet,
} from "./RecordingForms";
import { ContactPhotoMenu, useContactPhotoLink } from "./ContactPhoto";
import { PLAYER_SHEET_AVATAR_SIZE, PlayerAvatar, TABLE_AVATAR_SIZE } from "./PlayerAvatar";
import { liveOccupants, SeatPickerSheet } from "./SeatPickerSheet";
import { ShareSheet, TableSettingsSheet } from "./SharedTable";
import { EntryInspector, History, SeatingInspector } from "./VisitHistory";

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
  readonly seatingId?: SeatingId;
  readonly tableId?: TableId;
  readonly text: string;
  /** A rebuy or live seat change, which the toast can undo. */
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

          const seatNote =
            table.tableSeats === null
              ? null
              : seat.seatNumber !== null
                ? formatSeatLabel(seat.seatNumber, table.tableSeats)
                : !seat.playing && seat.seatOutcome.kind !== "none"
                  ? seat.seatOutcome.kind === "multiple"
                    ? "Multiple seats"
                    : formatSeatLabel(seat.seatOutcome.seat, table.tableSeats)
                  : null;

          const subtitle = seatNote ? `${seatNote} · ${status}` : status;

          const body = (
            <>
              <PlayerAvatar
                playerId={seat.playerId}
                name={seat.name}
                size={TABLE_AVATAR_SIZE}
                you={seat.isSelf}
              />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className={cn("type-body font-medium", ink)}>
                  {seat.name}
                </Text>
                <Text className={cn("type-footnote", soft)}>{subtitle}</Text>
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
              accessibilityLabel={`${seat.name}, ${subtitle}`}
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

type SeatStep =
  | { readonly type: "menu" | "rebuy" | "cash_out" | "reopen" | "return" | "history" | "seat" }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId }
  | { readonly type: "inspect_seating" | "void_seating"; readonly seatingId: SeatingId };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Another player's sheet, for whoever records for everyone here: who they are and what they've
 * put in, then a rebuy or cash-out while they play, or, once they've cashed out, undoing it or
 * sitting them back down. Their history opens in place, where an entry can be corrected or voided.
 */
export function SeatSheet({
  seat,
  table,
  onClose,
  onRecorded,
  onSeated,
}: {
  seat: TableSeat;
  table: LiveTable;
  onClose: () => void;
  onRecorded: (recorded: TableRecorded) => void;
  onSeated: (visitId: VisitId, name: string) => void;
}) {
  const { visit } = useRecordingVisit(seat.visitId);
  const prefs = usePreferences();
  const quick = useRecordingSubmit();
  const photo = useContactPhotoLink(seat.playerId);
  const [step, setStep] = useState<SeatStep>({ type: "menu" });

  if (!visit) return null;

  const shown = (amount: number) =>
    formatDisplayMoney(MinorUnits.make(amount), RECORDING_CURRENCY, prefs);

  const to = (type: "menu" | "history") => () => setStep({ type });
  const name = shortName(seat.name);

  if (step.type === "rebuy")
    return (
      <RebuySheet
        visit={visit}
        who={seat.name}
        back
        onClose={to("menu")}
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

  if (step.type === "cash_out")
    return (
      <CashOutSheet
        visit={visit}
        who={seat.name}
        note={cashOutNote(table.seats, seat.visitId)}
        back
        onClose={to("menu")}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            text: `${seat.name} cashed out ${shown(input.type === "finish" ? input.amount : 0)}.`,
          })
        }
      />
    );

  if (step.type === "reopen")
    return (
      <ReopenSheet
        visit={visit}
        back
        onClose={to("menu")}
        onReopened={() =>
          onRecorded({ visitId: seat.visitId, text: `${seat.name} is playing again.` })
        }
      />
    );

  if (step.type === "return")
    return (
      <SitDownSheet
        tableId={visit.visit.tableId}
        player={PlayerIdentity.make({ id: seat.playerId, displayName: seat.name })}
        back
        onClose={to("menu")}
        onSeated={(next) => onSeated(next, seat.name)}
      />
    );

  if (step.type === "seat" && table.tableSeats !== null)
    return (
      <SeatPickerSheet
        mode="visit"
        visit={visit}
        tableSeats={table.tableSeats}
        canEditTable={false}
        occupants={liveOccupants(table)}
        who={name}
        back
        depth={1}
        onClose={to("menu")}
        onSaved={(saved) =>
          onRecorded({
            visitId: saved.visitId,
            tableId: saved.tableId,
            seatingId: saved.seatingId,
            text: saved.text,
            undo: saved.undo,
          })
        }
        onOpenHistory={to("history")}
      />
    );

  if (step.type === "history")
    return (
      <Sheet open back depth={1} title={`${name}'s history`} onClose={to("menu")}>
        <History
          visit={visit}
          heading={false}
          onInspect={(entryId) => setStep({ type: "inspect", entryId })}
          onInspectSeating={(seatingId) => setStep({ type: "inspect_seating", seatingId })}
        />
      </Sheet>
    );

  if ("seatingId" in step) {
    const { seatingId } = step;
    const seating = visit.seatings.find((item) => item.id === seatingId);

    if (!seating) return null;

    if (step.type === "inspect_seating")
      return (
        <SeatingInspector
          visit={visit}
          seating={seating}
          back
          depth={2}
          onClose={to("history")}
          onVoid={() => setStep({ type: "void_seating", seatingId })}
        />
      );

    return (
      <VoidSeatingSheet
        visit={visit}
        seating={seating}
        totalSeats={table.tableSeats}
        back
        depth={3}
        onClose={() => setStep({ type: "inspect_seating", seatingId })}
        onVoided={() =>
          onRecorded({
            visitId: seat.visitId,
            text: "Seat record voided. It stays in the history.",
          })
        }
      />
    );
  }

  if ("entryId" in step) {
    const { entryId } = step;
    const entry = visit.entries.find((item) => item.id === entryId);

    if (!entry) return null;

    if (step.type === "inspect")
      return (
        <EntryInspector
          visit={visit}
          entry={entry}
          back
          depth={2}
          onClose={to("history")}
          onShow={(next) => setStep({ type: "inspect", entryId: next })}
          onCorrect={() => setStep({ type: "correct", entryId })}
          onVoid={() => setStep({ type: "void", entryId })}
        />
      );

    if (step.type === "correct")
      return (
        <CorrectSheet
          visit={visit}
          entry={entry}
          back
          depth={3}
          onClose={() => setStep({ type: "inspect", entryId })}
          onSaved={(next) =>
            onRecorded({ visitId: seat.visitId, entryId: next, text: "Correction saved." })
          }
        />
      );

    return (
      <VoidSheet
        visit={visit}
        entry={entry}
        back
        depth={3}
        onClose={() => setStep({ type: "inspect", entryId })}
        onVoided={() =>
          onRecorded({ visitId: seat.visitId, text: "Entry voided. It stays in the history." })
        }
      />
    );
  }

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

  const finishedAt = visit.visit.finishedAt;
  const playing = finishedAt === null;
  const entries = plural(visit.entries.length, "entry", "entries");

  const buyIns = visit.entries.filter(
    (entry) => entry.kind === "buy_in" && entry.voidedAt === null,
  ).length;

  const status = playing
    ? `Playing since ${formatTime(visit.visit.startedAt)} · ${plural(buyIns, "buy-in", "buy-ins")}`
    : `Cashed out at ${formatTime(finishedAt)}`;

  const playingAgain = table.seats.some(
    (item) => item.playerId === seat.playerId && item.playing && item.visitId !== seat.visitId,
  );

  const seatValue = (() => {
    if (table.tableSeats === null) return null;

    if (seat.playing)
      return seat.seatNumber !== null
        ? formatSeatLabel(seat.seatNumber, table.tableSeats)
        : "Not set";

    if (seat.seatOutcome.kind === "multiple") return "Multiple seats";

    if (seat.seatOutcome.kind === "seat")
      return formatSeatLabel(seat.seatOutcome.seat, table.tableSeats);

    return "Not set";
  })();

  return (
    <Sheet
      open
      hideHeader={Platform.OS === "android"}
      busy={quick.pending}
      title={Platform.OS === "ios" ? "" : name}
      onClose={onClose}
    >
      <View className="flex-row items-center gap-4">
        <ContactPhotoMenu
          playerId={seat.playerId}
          name={seat.name}
          size={PLAYER_SHEET_AVATAR_SIZE}
          photo={photo}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text accessibilityRole="header" numberOfLines={1} className="type-title text-ink">
            {seat.name}
          </Text>
          <Text className="type-footnote text-muted">{status}</Text>
        </View>
        {Platform.OS === "android" ? (
          <IconButton
            accessibilityLabel={`Close ${name}`}
            disabled={quick.pending}
            icon={<Icon name="close" color="ink" size={16} />}
            onPress={onClose}
          />
        ) : null}
      </View>
      {photo.message ? <Text className="type-footnote text-muted">{photo.message}</Text> : null}
      <Card className="gap-4">
        <View className="gap-1">
          <Text className="type-footnote text-muted">{playing ? "Bought in" : "Result"}</Text>
          <Money
            amount={playing ? visit.totals.buyIn : (visit.finalResult ?? seat.amount)}
            currency={RECORDING_CURRENCY}
            tone={playing ? "plain" : "result"}
            fit
            testID="seat-amount"
            className="type-hero"
          />
        </View>
        {playing ? null : (
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
        )}
      </Card>
      {playing ? (
        <View className="gap-3">
          <View className="gap-2">
            <Text className="type-footnote text-muted">Rebuy</Text>
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
                onPress={() => setStep({ type: "rebuy" })}
              />
            </View>
          </View>
          <Button
            label="Cash out"
            accessibilityLabel={`Cash out ${seat.name}`}
            variant="primary"
            size="lg"
            haptic
            disabled={quick.pending}
            onPress={() => setStep({ type: "cash_out" })}
          />
        </View>
      ) : Platform.OS === "android" ? (
        <View className="flex-row gap-2">
          <Button
            label="Undo cash-out"
            size="lg"
            className="flex-1"
            onPress={() => setStep({ type: "reopen" })}
          />
          {playingAgain ? null : (
            <Button
              label="Back at the table"
              variant="primary"
              size="lg"
              className="flex-1"
              onPress={() => setStep({ type: "return" })}
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
              onPress={() => setStep({ type: "return" })}
            />
          )}
          <Button
            label="Undo cash-out"
            variant="secondary"
            size="lg"
            onPress={() => setStep({ type: "reopen" })}
          />
        </View>
      )}
      {quick.error ? <FormError>{quick.error}</FormError> : null}
      <List>
        {seatValue !== null ? (
          <Row
            onPress={() => setStep({ type: "seat" })}
            accessibilityLabel={`${name}'s seat, ${seatValue}`}
            accessibilityHint="Sets or changes their seat"
          >
            <Text className="flex-1 type-body text-ink">Seat</Text>
            <Text className="type-callout text-muted">{seatValue}</Text>
            <Icon name="chevron-right" color="muted" size={18} />
          </Row>
        ) : null}
        <Row
          onPress={to("history")}
          accessibilityLabel={`${name}'s history, ${entries}`}
          accessibilityHint="Shows their buy-ins and cash-outs"
        >
          <Text className="flex-1 type-body text-ink">History</Text>
          <Text className="type-callout text-muted">{entries}</Text>
          <Icon name="chevron-right" color="muted" size={18} />
        </Row>
      </List>
    </Sheet>
  );
}

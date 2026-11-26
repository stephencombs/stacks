import type { LiveTable } from "@stacks/client-runtime/liveTable";
import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import { formatSeatLabel, type RecordingVisitView } from "@stacks/client-runtime/recordingView";
import type { SeatingId, TableId, VisitId } from "@stacks/contracts";
import { sortSeatings, tableSizes } from "@stacks/shared/seats";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { Text } from "../components/ui/Text";
import { BlackjackTableArc, type ArcOccupant } from "./BlackjackTableArc";

const BJ_SIZES = tableSizes.blackjack?.sizes ?? [5, 6, 7];

const sizeOptions = BJ_SIZES.map((n) => ({
  value: String(n),
  label: `${n} seats`,
}));

const maxOccupiedSeat = (occupants: ReadonlyMap<number, ArcOccupant> | undefined) =>
  !occupants || occupants.size === 0 ? 0 : Math.max(...occupants.keys());

/** Builds the live seat-number -> occupant map expected by `BlackjackTableArc` and `SeatPickerSheet`. */
export const liveOccupants = (table: LiveTable) => {
  const map = new Map<number, ArcOccupant>();

  for (const item of table.seats) {
    if (item.playing && item.seatNumber !== null) {
      map.set(item.seatNumber, {
        playerId: item.playerId,
        name: item.name,
        isSelf: item.isSelf,
        visitId: item.visitId,
      });
    }
  }

  return map;
};

type SeatPickerSaved = {
  readonly visitId: VisitId;
  readonly tableId: TableId;
  readonly seatingId: SeatingId;
  readonly text: string;
  readonly undo: boolean;
};

type DraftProps = {
  readonly mode: "draft";
  readonly seat: number | null;
  readonly tableSeats: number;
  readonly canEditTable?: boolean;
  readonly occupants?: ReadonlyMap<number, ArcOccupant> | undefined;
  readonly back?: boolean;
  readonly depth?: number;
  readonly onSelect: (seat: number | null) => void;
  readonly onTableSeats?: ((tableSeats: number) => void) | undefined;
  readonly onClose: () => void;
};

type VisitProps = {
  readonly mode: "visit";
  readonly visit: RecordingVisitView;
  readonly tableSeats: number;
  readonly canEditTable: boolean;
  readonly occupants?: ReadonlyMap<number, ArcOccupant> | undefined;
  readonly who?: string | undefined;
  readonly back?: boolean;
  readonly depth?: number;
  readonly onClose: () => void;
  readonly onSaved: (saved: SeatPickerSaved) => void;
  readonly onTableSeatsSaved?: ((tableSeats: number) => void) | undefined;
  readonly onOpenHistory?: (() => void) | undefined;
};

type SeatPickerProps = DraftProps | VisitProps;

/**
 * Instant seat picker built around `BlackjackTableArc`. Supports both form drafts (`mode="draft"`)
 * and persisted live/finished visits (`mode="visit"`), returning immediately once picked or saved.
 */
export function SeatPickerSheet(props: SeatPickerProps) {
  if (props.mode === "draft") return <DraftSeatPicker {...props} />;

  return <VisitSeatPicker {...props} />;
}

function DraftSeatPicker({
  seat,
  tableSeats,
  canEditTable = false,
  occupants,
  back = true,
  depth = 1,
  onSelect,
  onTableSeats,
  onClose,
}: DraftProps) {
  const [sizeError, setSizeError] = useState<string | null>(null);
  const maxLive = maxOccupiedSeat(occupants);

  const changeSize = (next: string) => {
    const count = Number(next);

    if (count < maxLive) {
      setSizeError(`Can't shrink to ${count} seats while Seat ${maxLive} is occupied.`);

      return;
    }

    setSizeError(null);
    onTableSeats?.(count);

    if (seat !== null && seat > count) onSelect(null);
  };

  const pickSpot = (picked: number) => {
    if (occupants?.has(picked)) {
      const taken = occupants.get(picked)!;
      setSizeError(`Seat ${picked} is already taken by ${taken.name}.`);

      return;
    }

    onSelect(picked);
    onClose();
  };

  return (
    <Sheet
      open
      back={back}
      depth={depth}
      title="Seat"
      description="Optional. Tap a spot from dealer's left (Seat 1)."
      onClose={onClose}
    >
      <BlackjackTableArc
        seats={tableSeats}
        surface="sheet"
        selectedSeat={seat}
        occupants={occupants}
        onSelectSpot={pickSpot}
      />
      {canEditTable && onTableSeats ? (
        <Choice
          label="Table size"
          options={sizeOptions}
          value={String(tableSeats)}
          onChange={changeSize}
        />
      ) : null}
      {sizeError ? <FormError>{sizeError}</FormError> : null}
      {seat !== null ? (
        <Button
          label="Clear seat"
          variant="secondary"
          size="lg"
          onPress={() => {
            onSelect(null);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

function VisitSeatPicker({
  visit,
  tableSeats,
  canEditTable,
  occupants,
  who,
  back = true,
  depth = 1,
  onClose,
  onSaved,
  onTableSeatsSaved,
  onOpenHistory,
}: VisitProps) {
  const save = useRecordingSubmit();
  const [localError, setLocalError] = useState<string | null>(null);
  const live = visit.visit.finishedAt === null;
  const standing = sortSeatings(visit.seatings.filter((item) => item.voidedAt === null));

  const path = standing
    .map((item) => (item.seat === null ? "Left seat" : `Seat ${item.seat}`))
    .join(" → ");

  const singleRecord =
    visit.seatOutcome.kind === "seat" && standing.length === 1 ? standing[0]! : null;

  const finishedReadOnly = !live && standing.length > 0 && singleRecord === null;

  const currentSelected = live
    ? visit.currentSeat
    : visit.seatOutcome.kind === "seat"
      ? visit.seatOutcome.seat
      : null;

  const submitSize = async (next: string) => {
    const count = Number(next);
    const maxLive = maxOccupiedSeat(occupants);

    if (count < maxLive) {
      setLocalError(`Can't shrink to ${count} seats while Seat ${maxLive} is occupied.`);

      return;
    }

    setLocalError(null);

    const receipt = await save.submit({
      type: "set_table_seats",
      tableId: visit.visit.tableId,
      tableSeats: count,
    });

    if (receipt) onTableSeatsSaved?.(count);
  };

  const selectSpot = async (picked: number) => {
    if (save.pending || finishedReadOnly) return;

    const occupied = occupants?.get(picked);

    if (occupied && occupied.visitId !== visit.visit.id) {
      setLocalError(
        `Seat ${picked} is already taken by ${occupied.isSelf ? "you" : occupied.name}.`,
      );

      return;
    }

    setLocalError(null);

    if (live) {
      if (picked === visit.currentSeat) {
        onClose();

        return;
      }

      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seat: picked,
      });

      if (receipt?.command.type === "set_seat") {
        const label = formatSeatLabel(picked, tableSeats);

        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text: who ? `${who} sat at ${label}.` : `Sat at ${label}.`,
          undo: true,
        });
      }

      return;
    }

    if (singleRecord) {
      if (picked === singleRecord.seat) {
        onClose();

        return;
      }

      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seat: picked,
        occurredAt: singleRecord.occurredAt,
        replacesSeatingId: singleRecord.id,
        reason: "Seat corrected",
      });

      if (receipt?.command.type === "set_seat") {
        const label = formatSeatLabel(picked, tableSeats);

        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text: `Seat updated to ${label}.`,
          undo: false,
        });
      }

      return;
    }

    const receipt = await save.submit({
      type: "set_seat",
      tableId: visit.visit.tableId,
      visitId: visit.visit.id,
      seat: picked,
      occurredAt: visit.visit.startedAt,
    });

    if (receipt?.command.type === "set_seat") {
      const label = formatSeatLabel(picked, tableSeats);

      onSaved({
        visitId: visit.visit.id,
        tableId: visit.visit.tableId,
        seatingId: receipt.command.seatingId,
        text: `Seat set to ${label}.`,
        undo: false,
      });
    }
  };

  const leaveOrRemove = async () => {
    if (save.pending) return;
    setLocalError(null);

    if (live) {
      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seat: null,
      });

      if (receipt?.command.type === "set_seat") {
        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text: who ? `${who} stood up from Seat ${visit.currentSeat}.` : "Left seat.",
          undo: true,
        });
      }

      return;
    }

    if (!singleRecord) return;

    const receipt = await save.submit({
      type: "void_seating",
      tableId: visit.visit.tableId,
      visitId: visit.visit.id,
      seatingId: singleRecord.id,
      reason: "Seat removed",
    });

    if (receipt) {
      onSaved({
        visitId: visit.visit.id,
        tableId: visit.visit.tableId,
        seatingId: singleRecord.id,
        text: "Seat removed.",
        undo: false,
      });
    }
  };

  const error = localError ?? save.error;

  return (
    <Sheet
      open
      back={back}
      depth={depth}
      busy={save.pending}
      title={who ? `${who}'s seat` : "Seat"}
      description={
        finishedReadOnly ? undefined : "Tap a spot to save. Seat 1 starts at the dealer's left."
      }
      onClose={onClose}
    >
      <BlackjackTableArc
        seats={tableSeats}
        surface="sheet"
        selectedSeat={currentSelected}
        occupants={occupants}
        disabled={save.pending}
        onSelectSpot={finishedReadOnly ? undefined : (picked) => void selectSpot(picked)}
      />
      {finishedReadOnly ? (
        <View className="gap-3">
          <View className="gap-1 rounded-xl bg-fill px-4 py-3">
            <Text className="type-footnote font-medium text-muted">Seat history</Text>
            <Text className="type-callout font-medium text-ink">{path}</Text>
            <Text className="type-footnote text-muted">
              Multiple seat changes were recorded for this session. Inspect or void an individual
              record from History.
            </Text>
          </View>
          {onOpenHistory ? (
            <Button label="Open history" variant="secondary" size="lg" onPress={onOpenHistory} />
          ) : null}
        </View>
      ) : null}
      {canEditTable && !finishedReadOnly ? (
        <Choice
          label="Table size"
          options={sizeOptions}
          value={String(tableSeats)}
          onChange={(next) => void submitSize(next)}
        />
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
      {live && visit.currentSeat !== null ? (
        <Button
          label="Leave seat"
          variant="secondary"
          size="lg"
          pending={save.pending}
          onPress={() => void leaveOrRemove()}
        />
      ) : null}
      {!live && singleRecord ? (
        <Button
          label="Remove seat"
          variant="danger"
          size="lg"
          pending={save.pending}
          onPress={() => void leaveOrRemove()}
        />
      ) : null}
    </Sheet>
  );
}

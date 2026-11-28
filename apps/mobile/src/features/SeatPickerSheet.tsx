import type { LiveTable } from "@stacks/client-runtime/liveTable";
import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import { formatSeatsLabel, type RecordingVisitView } from "@stacks/client-runtime/recordingView";
import type { SeatingId, TableId, VisitId } from "@stacks/contracts";
import { sameSeats, seatingSeats, sortSeatings, tableSizes } from "@stacks/shared/seats";
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

const formatDraftConfirm = (picked: ReadonlyArray<number>, tableSeats: number) => {
  if (picked.length === 0) return "Done";

  if (picked.length === 1) return `Use Seat ${picked[0]}`;

  return `Use ${formatSeatsLabel(picked, tableSeats)}`;
};

const formatStandingItem = (list: ReadonlyArray<number>) => {
  if (list.length === 0) return "Left seat";

  if (list.length === 1) return `Seat ${list[0]}`;

  return formatSeatsLabel(list, null) ?? "";
};

const toggleSeat = (seats: ReadonlyArray<number>, spot: number) =>
  seats.includes(spot)
    ? seats.filter((item) => item !== spot)
    : [...seats, spot].toSorted((a, b) => a - b);

const saveSeatLabel = (
  picked: ReadonlyArray<number>,
  initialCount: number,
  tableSeats: number,
  live: boolean,
) => {
  if (picked.length === 0) {
    if (initialCount === 0) return "Save seat";

    return live
      ? initialCount > 1
        ? "Leave seats"
        : "Leave seat"
      : initialCount > 1
        ? "Remove seats"
        : "Remove seat";
  }

  if (picked.length === 1) return `Save Seat ${picked[0]}`;

  return `Save ${formatSeatsLabel(picked, tableSeats)}`;
};

/** Builds the live seat-number -> occupant map expected by `BlackjackTableArc` and `SeatPickerSheet`. */
export const liveOccupants = (table: LiveTable) => {
  const map = new Map<number, ArcOccupant>();

  for (const item of table.seats) {
    if (!item.playing) continue;

    for (const seatNumber of item.seatNumbers) {
      map.set(seatNumber, {
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
  readonly seats: ReadonlyArray<number>;
  readonly tableSeats: number;
  readonly canEditTable?: boolean;
  readonly occupants?: ReadonlyMap<number, ArcOccupant> | undefined;
  readonly back?: boolean;
  readonly depth?: number;
  readonly onSelect: (seats: ReadonlyArray<number>) => void;
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
 * Multi-spot blackjack seat picker built around `BlackjackTableArc`. Tapping spots toggles them so
 * players can sit at one or several hands simultaneously before confirming, while keeping `Leave`
 * and `Clear` shortcuts one tap away.
 */
export function SeatPickerSheet(props: SeatPickerProps) {
  if (props.mode === "draft") return <DraftSeatPicker {...props} />;

  return <VisitSeatPicker {...props} />;
}

function DraftSeatPicker({
  seats,
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
  const resetKey = seats.join(",");
  const [draft, setDraft] = useState(() => ({ key: resetKey, seats }));
  const picked = draft.key === resetKey ? draft.seats : seats;
  const setPicked = (next: ReadonlyArray<number>) => setDraft({ key: resetKey, seats: next });
  const maxLive = maxOccupiedSeat(occupants);

  const changeSize = (next: string) => {
    const count = Number(next);

    if (count < maxLive) {
      setSizeError(`Can't shrink to ${count} seats while Seat ${maxLive} is occupied.`);

      return;
    }

    setSizeError(null);
    onTableSeats?.(count);

    const trimmed = picked.filter((seat) => seat <= count);

    if (trimmed.length !== picked.length) setPicked(trimmed);
  };

  const toggleSpot = (spot: number) => {
    if (occupants?.has(spot)) {
      const taken = occupants.get(spot)!;
      setSizeError(`Seat ${spot} is already taken by ${taken.name}.`);

      return;
    }

    setSizeError(null);
    setPicked(toggleSeat(picked, spot));
  };

  const confirmLabel = formatDraftConfirm(picked, tableSeats);

  return (
    <Sheet
      open
      back={back}
      depth={depth}
      title="Seat"
      description="Optional. Tap one or more spots from dealer's left (Seat 1)."
      onClose={onClose}
    >
      <BlackjackTableArc
        seats={tableSeats}
        surface="sheet"
        selectedSeats={picked}
        occupants={occupants}
        onSelectSpot={toggleSpot}
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
      <Button
        label={confirmLabel}
        variant="primary"
        size="lg"
        onPress={() => {
          onSelect(picked);
          onClose();
        }}
      />
      {picked.length > 0 ? (
        <Button
          label={picked.length > 1 ? "Clear seats" : "Clear seat"}
          variant="secondary"
          size="lg"
          onPress={() => {
            onSelect([]);
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

  const path = standing.map((item) => formatStandingItem(seatingSeats(item))).join(" → ");

  const singleRecord =
    standing.length === 1 && seatingSeats(standing[0]!).length > 0 ? standing[0]! : null;

  const finishedReadOnly = !live && standing.length > 0 && singleRecord === null;

  const otherOccupants = new Map<number, ArcOccupant>();
  let existingSelfOccupant: ArcOccupant | undefined;
  const liveOccupantSeats: Array<number> = [];

  if (occupants) {
    for (const [seatNumber, occ] of occupants) {
      if (occ.visitId === visit.visit.id) {
        existingSelfOccupant = occ;
        liveOccupantSeats.push(seatNumber);
      } else {
        otherOccupants.set(seatNumber, occ);
      }
    }
  }

  liveOccupantSeats.sort((a, b) => a - b);

  const initialSeats: ReadonlyArray<number> = live
    ? occupants
      ? liveOccupantSeats
      : visit.currentSeats
    : singleRecord
      ? seatingSeats(singleRecord)
      : [];

  const resetKey = `${visit.visit.id}:${initialSeats.join(",")}:${live ? "live" : "done"}`;
  const [draft, setDraft] = useState(() => ({ key: resetKey, seats: initialSeats }));
  const picked = draft.key === resetKey ? draft.seats : initialSeats;
  const setPicked = (next: ReadonlyArray<number>) => setDraft({ key: resetKey, seats: next });

  const displayOccupants = (() => {
    if (!live) return otherOccupants;

    const map = new Map(otherOccupants);

    const selfOccupant: ArcOccupant = existingSelfOccupant ?? {
      playerId: visit.visit.playerId,
      name: who ?? "You",
      isSelf: who === undefined,
      visitId: visit.visit.id,
    };

    for (const seat of picked) map.set(seat, selfOccupant);

    return map;
  })();

  const submitSize = async (next: string) => {
    const count = Number(next);

    const maxLive = Math.max(maxOccupiedSeat(otherOccupants), ...(live ? initialSeats : []));

    if (count < maxLive) {
      setLocalError(`Can't shrink to ${count} seats while Seat ${maxLive} is occupied.`);

      return;
    }

    setLocalError(null);

    const trimmed = picked.filter((seat) => seat <= count);

    if (trimmed.length !== picked.length) setPicked(trimmed);

    const receipt = await save.submit({
      type: "set_table_seats",
      tableId: visit.visit.tableId,
      tableSeats: count,
    });

    if (receipt) onTableSeatsSaved?.(count);
  };

  const toggleSpot = (spot: number) => {
    if (save.pending || finishedReadOnly) return;

    const occupied = otherOccupants.get(spot);

    if (occupied) {
      setLocalError(`Seat ${spot} is already taken by ${occupied.isSelf ? "you" : occupied.name}.`);

      return;
    }

    setLocalError(null);
    setPicked(toggleSeat(picked, spot));
  };

  const leaveOrRemove = async () => {
    if (save.pending) return;
    setLocalError(null);

    if (live) {
      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seats: [],
      });

      if (receipt?.command.type === "set_seat") {
        const text =
          initialSeats.length > 1
            ? who
              ? `${who} stood up.`
              : "Left seats."
            : who
              ? `${who} stood up from Seat ${initialSeats[0]}.`
              : "Left seat.";

        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text,
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
        text: initialSeats.length > 1 ? "Seats removed." : "Seat removed.",
        undo: false,
      });
    }
  };

  const confirmSave = async () => {
    if (save.pending || finishedReadOnly || sameSeats(picked, initialSeats)) return;

    if (picked.length === 0) {
      await leaveOrRemove();

      return;
    }

    setLocalError(null);
    const label = formatSeatsLabel(picked, tableSeats)!;

    if (live) {
      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seats: picked,
      });

      if (receipt?.command.type === "set_seat") {
        const text =
          picked.length === 1
            ? who
              ? `${who} sat at ${label}.`
              : `Sat at ${label}.`
            : who
              ? `${who} is playing ${label}.`
              : `Playing ${label}.`;

        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text,
          undo: true,
        });
      }

      return;
    }

    if (singleRecord) {
      const receipt = await save.submit({
        type: "set_seat",
        tableId: visit.visit.tableId,
        visitId: visit.visit.id,
        seats: picked,
        occurredAt: singleRecord.occurredAt,
        replacesSeatingId: singleRecord.id,
        reason: "Seat corrected",
      });

      if (receipt?.command.type === "set_seat") {
        onSaved({
          visitId: visit.visit.id,
          tableId: visit.visit.tableId,
          seatingId: receipt.command.seatingId,
          text: `${picked.length > 1 ? "Seats" : "Seat"} updated to ${label}.`,
          undo: false,
        });
      }

      return;
    }

    const receipt = await save.submit({
      type: "set_seat",
      tableId: visit.visit.tableId,
      visitId: visit.visit.id,
      seats: picked,
      occurredAt: visit.visit.startedAt,
    });

    if (receipt?.command.type === "set_seat") {
      onSaved({
        visitId: visit.visit.id,
        tableId: visit.visit.tableId,
        seatingId: receipt.command.seatingId,
        text: `${picked.length > 1 ? "Seats" : "Seat"} set to ${label}.`,
        undo: false,
      });
    }
  };

  const error = localError ?? save.error;
  const unchanged = sameSeats(picked, initialSeats);

  return (
    <Sheet
      open
      back={back}
      depth={depth}
      busy={save.pending}
      title={who ? `${who}'s seat` : "Seat"}
      description={
        finishedReadOnly
          ? undefined
          : "Tap one or more spots from dealer's left (Seat 1), then save."
      }
      onClose={onClose}
    >
      <BlackjackTableArc
        seats={tableSeats}
        surface="sheet"
        selectedSeats={finishedReadOnly ? [] : picked}
        occupants={displayOccupants}
        disabled={save.pending}
        onSelectSpot={finishedReadOnly ? undefined : toggleSpot}
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
      {!finishedReadOnly ? (
        <Button
          label={saveSeatLabel(picked, initialSeats.length, tableSeats, live)}
          variant="primary"
          size="lg"
          pending={save.pending}
          disabled={unchanged || save.pending}
          onPress={() => void confirmSave()}
        />
      ) : null}
      {live && initialSeats.length > 0 && picked.length > 0 ? (
        <Button
          label={initialSeats.length > 1 ? "Leave seats" : "Leave seat"}
          variant="secondary"
          size="lg"
          disabled={save.pending}
          onPress={() => void leaveOrRemove()}
        />
      ) : null}
      {!live && singleRecord && picked.length > 0 ? (
        <Button
          label={initialSeats.length > 1 ? "Remove seats" : "Remove seat"}
          variant="danger"
          size="lg"
          disabled={save.pending}
          onPress={() => void leaveOrRemove()}
        />
      ) : null}
    </Sheet>
  );
}

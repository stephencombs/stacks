import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { useServerTable } from "@stacks/client-runtime/recordingReact";
import {
  formatSeatLabel,
  historyEntryName,
  historyLines,
  RECORDING_CURRENCY,
  type RecordingEvent,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import type { EntryId, PlayEntry, SeatingId, VisitSeating } from "@stacks/contracts";
import { seatCount, sortSeatings } from "@stacks/shared/seats";
import * as DateTime from "effect/DateTime";
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { Text } from "../components/ui/Text";
import { useRecordingState } from "../lib/recording";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";

const eventText = (event: RecordingEvent) =>
  event.type === "finished" ? "Finished playing" : `Reopened: ${event.reason}`;

/**
 * A visit's entries and events, newest first, with voided ones last. A row opens that entry, where
 * it can be corrected or voided. Inside a sheet already titled for it, `heading` is turned off.
 */
export function History({
  visit,
  own = true,
  who = "Their",
  heading = true,
  onInspect,
  onInspectSeating,
}: {
  visit: RecordingVisitView;
  own?: boolean;
  who?: string;
  heading?: boolean;
  onInspect: (entryId: EntryId) => void;
  onInspectSeating?: ((seatingId: SeatingId) => void) | undefined;
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
  const totalSeats = seatCount(visit.table);
  const seatingText = new Map<SeatingId, string>();
  let previousSeat: number | null = null;

  for (const seating of sortSeatings(visit.seatings)) {
    const voided = seating.voidedAt !== null;

    if (seating.seat === null) {
      seatingText.set(
        seating.id,
        previousSeat === null ? "Left seat" : `Left Seat ${previousSeat}`,
      );

      if (!voided) previousSeat = null;
      continue;
    }

    const label = formatSeatLabel(seating.seat, totalSeats);
    seatingText.set(seating.id, previousSeat === null ? `Sat at ${label}` : `Moved to ${label}`);

    if (!voided) previousSeat = seating.seat;
  }

  const entryCount = visit.entries.length === 1 ? "1 entry" : `${visit.entries.length} entries`;

  const headingCount =
    visit.seatings.length === 0
      ? entryCount
      : `${entryCount} · ${visit.seatings.length === 1 ? "1 seat" : `${visit.seatings.length} seats`}`;

  return (
    <View className="gap-2">
      {heading ? (
        <SectionHeading count={headingCount}>
          {Platform.OS === "android" ? (own ? "Your history" : `${who}'s history`) : "History"}
        </SectionHeading>
      ) : null}
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

          if (line.type === "seating") {
            const seating = line.seating;
            const voided = seating.voidedAt !== null;
            const title = seatingText.get(seating.id) ?? "Seat";
            const time = formatTime(seating.occurredAt);

            const meta = [time, voided ? "Voided" : null].filter(Boolean).join(" · ");

            return (
              <Row
                key={seating.id}
                onPress={onInspectSeating ? () => onInspectSeating(seating.id) : undefined}
                accessibilityLabel={`${title}, ${time}${voided ? ", voided" : ""}`}
                accessibilityHint={onInspectSeating ? "Shows this seat record" : undefined}
                className="min-h-14"
              >
                <View className={cn("min-w-0 flex-1 gap-0.5", voided && "opacity-50")}>
                  <Text
                    className={cn(
                      "text-base font-medium",
                      voided ? "text-muted line-through" : "text-ink",
                    )}
                  >
                    {title}
                  </Text>
                  <Text className="text-sm text-muted">{meta}</Text>
                </View>
              </Row>
            );
          }

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

/** One entry of a visit, with the ways to correct or void it while it still counts. */
export function EntryInspector({
  visit,
  entry,
  back = false,
  depth,
  onClose,
  onShow,
  onCorrect,
  onVoid,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  back?: boolean;
  depth?: number;
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
      back={back}
      depth={depth}
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

/** One seat record in a visit's history, with a path to void it while it still stands. */
export function SeatingInspector({
  visit,
  seating,
  back = false,
  depth,
  onClose,
  onVoid,
}: {
  visit: RecordingVisitView;
  seating: VisitSeating;
  back?: boolean;
  depth?: number;
  onClose: () => void;
  onVoid: () => void;
}) {
  const totalSeats = seatCount(visit.table);
  const at = (value: DateTime.Utc) => `${formatDay(value)}, ${formatTime(value)}`;
  const voided = seating.voidedAt !== null;

  const title = seating.seat === null ? "Left seat" : formatSeatLabel(seating.seat, totalSeats);

  return (
    <Sheet
      open
      back={back}
      depth={depth}
      onClose={onClose}
      title={title}
      {...(voided ? { description: "Voided. It no longer counts toward seat records." } : {})}
      footer={
        voided ? undefined : (
          <Button label="Void seat record" variant="danger" size="lg" onPress={onVoid} />
        )
      }
    >
      <List>
        <Detail label="Action">
          <Text className={cn("text-base font-medium text-ink", voided && "line-through")}>
            {title}
          </Text>
        </Detail>
        <Detail label="Time">
          <Text selectable className="text-base text-ink">
            {at(seating.occurredAt)}
          </Text>
        </Detail>
        <Detail label="Recorded">
          <Text className="text-base text-ink">By you on this device, {at(seating.createdAt)}</Text>
        </Detail>
        {seating.voidedAt ? (
          <Detail label="Voided">
            <Text selectable className="text-base text-ink">
              {at(seating.voidedAt)} · {seating.voidReason}
            </Text>
          </Detail>
        ) : null}
      </List>
    </Sheet>
  );
}

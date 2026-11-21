import type { TripId } from "@stacks/contracts";
import { formatDecimal } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";

import { localDateText, RECORDING_CURRENCY, type RecordedVisit } from "./recordingView.ts";

const COLUMNS = [
  "session_id",
  "started_at",
  "finished_at",
  "duration_minutes",
  "game",
  "high_limit",
  "casino",
  "city",
  "region",
  "trip",
  "buy_in",
  "cash_out",
  "adjustment",
  "result",
  "currency",
] as const;

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const csvText = (value: string) =>
  /^[=+\-@]/.test(value.replaceAll(/\p{Cc}/gu, "").trimStart()) ? `'${value}` : value;

const csvRow = (cells: ReadonlyArray<string>) => cells.map(csvCell).join(",");

export const personalCsvFilename = (now = new Date()) =>
  `color-up-sessions-${localDateText(now)}.csv`;

/**
 * Exports all finished, non-deleted personal sessions in chronological order, using exact integer
 * minor units formatted as decimal strings so totals match `personalStats`.
 */
export const exportPersonalSessionsCsv = (
  visits: ReadonlyArray<RecordedVisit>,
  { tripNames = new Map() }: { readonly tripNames?: ReadonlyMap<TripId, string> } = {},
) => {
  const finished = visits
    .filter(
      ({ visit, finalResult }) =>
        visit.deletedAt === undefined && visit.finishedAt !== null && finalResult !== null,
    )
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(a.visit.finishedAt!) - DateTime.toEpochMillis(b.visit.finishedAt!) ||
        (a.visit.id < b.visit.id ? -1 : a.visit.id > b.visit.id ? 1 : 0),
    );

  const lines = [
    COLUMNS.join(","),
    ...finished.map(({ visit, totals, finalResult, table, venue }) => {
      const durationMs =
        DateTime.toEpochMillis(visit.finishedAt!) - DateTime.toEpochMillis(visit.startedAt);

      const durationMinutes = Math.round(durationMs / 60_000);
      const tripName = table.tripId ? (tripNames.get(table.tripId) ?? "Group trip") : "";

      return csvRow([
        visit.id,
        DateTime.formatIso(visit.startedAt),
        DateTime.formatIso(visit.finishedAt!),
        String(durationMinutes),
        table.game ?? "",
        table.highLimit ? "true" : "false",
        csvText(venue?.name ?? ""),
        csvText(venue?.city ?? ""),
        csvText(venue?.region ?? ""),
        csvText(tripName),
        formatDecimal(totals.buyIn, RECORDING_CURRENCY),
        formatDecimal(totals.cashOut, RECORDING_CURRENCY),
        formatDecimal(totals.adjustment, RECORDING_CURRENCY),
        formatDecimal(finalResult!, RECORDING_CURRENCY),
        RECORDING_CURRENCY,
      ]);
    }),
  ];

  return `${lines.join("\n")}\n`;
};

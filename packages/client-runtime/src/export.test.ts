import { Game, MinorUnits, PlayerId, TableId, TripId, VenueId, VisitId } from "@stacks/contracts";
import { parseMoney } from "@stacks/shared/money";
import { personalStats } from "@stacks/shared/stats";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { expect, it } from "vite-plus/test";

import { csvText, exportPersonalSessionsCsv, personalCsvFilename } from "./export.ts";
import { RECORDING_CURRENCY, type RecordedVisit } from "./recordingView.ts";

const uuid = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

const parseCsv = (csv: string) => {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const makeVisit = ({
  num,
  startedAt,
  finishedAt,
  buyIn,
  cashOut,
  adjustment = 0,
  game = null,
  venue = null,
  tripId = null,
  deletedAt,
  highLimit = false,
}: {
  num: number;
  startedAt: string;
  finishedAt: string | null;
  buyIn: number;
  cashOut: number;
  adjustment?: number;
  game?: Game | null;
  venue?: RecordedVisit["venue"];
  tripId?: TripId | null;
  deletedAt?: string | undefined;
  highLimit?: boolean;
}) => {
  const start = DateTime.makeUnsafe(startedAt);
  const end = finishedAt ? DateTime.makeUnsafe(finishedAt) : null;
  const finalResult = end === null ? null : MinorUnits.make(cashOut + adjustment - buyIn);
  const tableId = TableId.make(uuid(10_000 + num));
  const playerId = PlayerId.make(uuid(1));

  const visit = {
    id: VisitId.make(uuid(20_000 + num)),
    tableId,
    playerId,
    startedAt: start,
    finishedAt: end,
    revision: 1,
  };

  return {
    visit: deletedAt ? { ...visit, deletedAt: DateTime.makeUnsafe(deletedAt) } : visit,
    totals: {
      buyIn: MinorUnits.make(buyIn),
      cashOut: MinorUnits.make(cashOut),
      adjustment: MinorUnits.make(adjustment),
    },
    finalResult,
    table: {
      id: tableId,
      starterPlayerId: playerId,
      game,
      venueId: venue?.id ?? null,
      highLimit,
      tripId,
    },
    venue,
  };
};

it("neutralizes spreadsheet formulas and names personal CSV files by date", () => {
  expect(csvText("=SUM(A1)")).toBe("'=SUM(A1)");
  expect(csvText("  +10")).toBe("'  +10");
  expect(csvText("Bellagio")).toBe("Bellagio");
  expect(personalCsvFilename(new Date(2026, 10, 20, 15, 0, 0))).toBe(
    "color-up-sessions-2026-11-20.csv",
  );
});

it("exports finished non-deleted sessions in chronological order with exact formula safety", () => {
  const tripId = TripId.make(uuid(500));

  const visits: ReadonlyArray<RecordedVisit> = [
    makeVisit({
      num: 1,
      startedAt: "2026-11-20T05:00:00Z",
      finishedAt: null,
      buyIn: 50000,
      cashOut: 0,
    }),
    makeVisit({
      num: 2,
      startedAt: "2026-11-18T02:00:00Z",
      finishedAt: "2026-11-18T05:00:00Z",
      deletedAt: "2026-11-18T06:00:00Z",
      buyIn: 10000,
      cashOut: 30000,
    }),
    makeVisit({
      num: 3,
      startedAt: "2026-11-19T02:00:00Z",
      finishedAt: "2026-11-19T04:15:00Z",
      buyIn: 20000,
      cashOut: 14950,
      adjustment: -50,
      game: "blackjack",
      highLimit: true,
      tripId,
      venue: {
        id: VenueId.make(uuid(301)),
        name: '=Aria "Club"',
        kind: "casino",
        city: "Las Vegas, NV",
        region: "NV",
        country: "US",
        lat: null,
        lng: null,
      },
    }),
    makeVisit({
      num: 4,
      startedAt: "2026-11-17T01:00:00Z",
      finishedAt: "2026-11-17T03:30:00Z",
      buyIn: 10000,
      cashOut: 25500,
      game: "poker_cash",
    }),
  ];

  const csv = exportPersonalSessionsCsv(visits, {
    tripNames: new Map([[tripId, "+Vegas 2026"]]),
  });

  const [header, row1, row2, ...rest] = parseCsv(csv);
  expect(rest).toEqual([]);
  expect(header).toEqual([
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
  ]);
  expect(row1).toEqual([
    uuid(20_004),
    "2026-11-17T01:00:00.000Z",
    "2026-11-17T03:30:00.000Z",
    "150",
    "poker_cash",
    "false",
    "",
    "",
    "",
    "",
    "100.00",
    "255.00",
    "0.00",
    "155.00",
    "USD",
  ]);
  expect(row2).toEqual([
    uuid(20_003),
    "2026-11-19T02:00:00.000Z",
    "2026-11-19T04:15:00.000Z",
    "135",
    "blackjack",
    "true",
    '\'=Aria "Club"',
    "Las Vegas, NV",
    "NV",
    "'+Vegas 2026",
    "200.00",
    "149.50",
    "-0.50",
    "-51.00",
    "USD",
  ]);
});

it("keeps exported totals equal to personalStats across random histories", () => {
  let seed = 0x51a7_2026;

  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;

    return seed;
  };

  const games: ReadonlyArray<Game | null> = [null, ...Game.literals];

  const venues: ReadonlyArray<RecordedVisit["venue"]> = [
    null,
    {
      id: VenueId.make(uuid(701)),
      name: "Bellagio",
      kind: "casino",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      lat: null,
      lng: null,
    },
    {
      id: VenueId.make(uuid(702)),
      name: "Aria",
      kind: "casino",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      lat: null,
      lng: null,
    },
  ];

  let nextNum = 100;

  for (let trial = 0; trial < 25; trial++) {
    const count = 1 + (next() % 20);
    const visits: Array<RecordedVisit> = [];

    for (let i = 0; i < count; i++) {
      const startMs = Date.UTC(2026, next() % 12, 1 + (next() % 28), next() % 24, next() % 60);
      const durationMs = ((next() % 600) + 1) * 60_000;
      const live = next() % 6 === 0;
      const deleted = !live && next() % 7 === 0;
      const buyIn = 100 + (next() % 500_000);
      const cashOut = live ? 0 : next() % 600_000;
      const adjustment = live ? 0 : (next() % 20_000) - 10_000;
      visits.push(
        makeVisit({
          num: nextNum++,
          startedAt: new Date(startMs).toISOString(),
          finishedAt: live ? null : new Date(startMs + durationMs).toISOString(),
          deletedAt: deleted ? new Date(startMs + durationMs + 1000).toISOString() : undefined,
          buyIn,
          cashOut,
          adjustment,
          game: games[next() % games.length]!,
          venue: venues[next() % venues.length]!,
        }),
      );
    }

    const csv = exportPersonalSessionsCsv(visits);
    const [, ...rows] = parseCsv(csv);
    const stats = personalStats(visits, DateTime.zoneMakeNamedUnsafe("UTC"));
    expect(rows).toHaveLength(stats.summary.sessions);

    let csvResultSum = 0n;
    const byGame = new Map<string, bigint>();
    const byVenue = new Map<string, bigint>();

    for (const cols of rows) {
      const buyIn = Option.getOrThrow(parseMoney(cols[10]!, RECORDING_CURRENCY));
      const cashOut = Option.getOrThrow(parseMoney(cols[11]!, RECORDING_CURRENCY));
      const adj = Option.getOrThrow(parseMoney(cols[12]!, RECORDING_CURRENCY));
      const result = Option.getOrThrow(parseMoney(cols[13]!, RECORDING_CURRENCY));
      expect(BigInt(result)).toBe(BigInt(cashOut) + BigInt(adj) - BigInt(buyIn));
      csvResultSum += BigInt(result);

      const gameKey = cols[4] ?? "";
      byGame.set(gameKey, (byGame.get(gameKey) ?? 0n) + BigInt(result));
      const venueKey = cols[6] ?? "";
      byVenue.set(venueKey, (byVenue.get(venueKey) ?? 0n) + BigInt(result));
    }

    expect(csvResultSum).toBe(BigInt(stats.summary.result));

    for (const row of stats.byGame) {
      expect(byGame.get(row.game ?? "") ?? 0n).toBe(BigInt(row.result));
    }

    const venueNameById = new Map(
      venues.flatMap((venue) => (venue ? [[venue.id, venue.name] as const] : [])),
    );

    for (const row of stats.byCasino) {
      const name = row.venueId ? venueNameById.get(row.venueId)! : "";
      expect(byVenue.get(name) ?? 0n).toBe(BigInt(row.result));
    }
  }
});

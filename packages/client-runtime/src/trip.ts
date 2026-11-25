import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Layer from "effect/Layer";
import {
  MinorUnits,
  TripId,
  type CurrencyCode,
  type GroupListItem,
  type SessionSummary,
  type TableId,
  type Trip,
  type TripDetail,
  type TripTable,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import {
  NIGHT_ENDS_HOUR,
  nightKey,
  type PlayerTrip,
  type TripClock,
  type TripNight,
  type TripSession,
} from "@stacks/shared/trips";

/**
 * One thing played on a trip: an older group session, or a table recorded from Play. Both read as
 * a `TripSession`, so standings, nights and awards count them alike.
 */
export type TripPlay =
  | (SessionSummary & { readonly kind: "session"; readonly live: boolean })
  | (TripTable & {
      readonly kind: "table";
      readonly live: boolean;
      readonly session: {
        readonly id: TableId;
        readonly startedAt: DateTime.Utc;
        readonly highLimit: boolean;
      };
    });

const sessionPlay: (summary: SessionSummary) => TripPlay = (summary) => ({
  ...summary,
  kind: "session",
  live: summary.session.status === "live",
});

const tablePlay: (table: TripTable) => TripPlay = (table) => ({
  ...table,
  kind: "table",
  live: table.endedAt === null,
  session: { id: table.table.id, startedAt: table.startedAt, highLimit: table.table.highLimit },
});

/** A trip's sessions and tables together, oldest first. */
export const tripPlays: (
  trip: Pick<TripDetail, "sessions" | "tables">,
) => ReadonlyArray<TripPlay> = (trip) =>
  [...trip.sessions.map(sessionPlay), ...trip.tables.map(tablePlay)].toSorted(
    (a, b) =>
      DateTime.toEpochMillis(a.session.startedAt) - DateTime.toEpochMillis(b.session.startedAt),
  );

/** Every trip in the groups you're in, by name, for labeling tables that belong to one. */
export const tripNames = (
  groups: ReadonlyArray<{ readonly trips: ReadonlyArray<Pick<Trip, "id" | "name">> }>,
) => new Map(groups.flatMap(({ trips }) => trips.map((trip) => [trip.id, trip.name] as const)));

/** What a trip has finished: what standings, nights and awards count. */
export const closedPlays = (trip: Pick<TripDetail, "sessions" | "tables">) =>
  tripPlays(trip).filter((play) => !play.live);

const HOUR = 3_600_000;

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The trip board's clock in the viewer's own time zone. */
export const localClock: TripClock = {
  night: (at) => nightKey(at, DateTime.zoneMakeLocal()),
  hour: (at) => new Date(DateTime.toEpochMillis(at)).getHours(),
};

export const nightWeekday = (night: TripNight<TripSession>) => {
  const first = night.sessions[0]!;
  const date = new Date(DateTime.toEpochMillis(first.session.startedAt) - NIGHT_ENDS_HOUR * HOUR);

  return weekday.format(date);
};

/** "Day 3 · Friday", for the night the board is on. */
export const nightLabel = (night: TripNight<TripSession>) =>
  `Day ${night.number} · ${nightWeekday(night)}`;

/** "Oct 21 – Oct 25", or "Since Oct 21" while the trip is going. */
export const tripDates = (trip: Trip) => {
  const from = shortDate.format(DateTime.toDateUtc(trip.startedAt));

  return trip.endedAt === null
    ? `Since ${from}`
    : `${from} – ${shortDate.format(DateTime.toDateUtc(trip.endedAt))}`;
};

/** Money the way the board shows it: always signed, cents according to device preferences. */
export const boardMoney = (
  amount: number,
  currency: CurrencyCode,
  signed = true,
  options: { readonly showCents?: boolean; readonly privacyMode?: boolean } = {},
) => {
  if (options.privacyMode) return "••••";

  return formatMoney(MinorUnits.make(amount), currency, {
    signDisplay: signed ? "exceptZero" : "auto",
    trailingZeroDisplay: options.showCents ? "auto" : "stripIfInteger",
  });
};

/** A run of results in words, once it's at least two long: "3 wins in a row". */
export const streakLine = (streak: { readonly length: number; readonly winning: boolean }) =>
  streak.length < 2 ? null : `${streak.length} ${streak.winning ? "wins" : "losses"} in a row`;

/** "1st", "2nd", "3rd", "11th": a place on the board. */
export const ordinal = (n: number) => {
  const rank = Math.abs(n);
  const lastTwo = rank % 100;

  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? "th" : (["th", "st", "nd", "rd"][rank % 10] ?? "th");

  return `${n}${suffix}`;
};

/** The lines under a player's trip total: how far they climbed, and how often they won. */
export const tripLines = (trip: PlayerTrip<unknown>, currency: CurrencyCode) => ({
  climb:
    trip.low < 0 && trip.net > trip.low
      ? `Up ${boardMoney(trip.net - trip.low, currency, false)} from your low`
      : null,
  winRate: trip.played === 0 ? "–" : `${Math.round((trip.won / trip.played) * 100)}%`,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/** A return on buy-ins, "+55%" or "-30%", or "–" for someone who never put money in. */
export const returnLabel = (value: number | null) =>
  value === null
    ? "–"
    : Math.round(value * 100) === 0
      ? "0%"
      : percent.format(value).replace("−", "-");

/** A night's or a trip's record: "4W · 3L · 1 even", leaving out what's zero. */
export const recordLine = (wins: number, losses: number, even: number) =>
  [wins ? `${wins}W` : null, losses ? `${losses}L` : null, even ? `${even} even` : null]
    .filter((part) => part !== null)
    .join(" · ");

export type LastTripStorage = {
  readonly load: () => string | null;
  readonly save: (tripId: string | null) => void;
};

export type LastTripStore = ReturnType<typeof makeLastTripStore>;

export class LastTripStoreService extends Context.Service<LastTripStoreService, LastTripStore>()(
  "@stacks/client-runtime/LastTripStore",
) {}

export const LastTripStoreLive = (storage: LastTripStorage) =>
  Layer.sync(LastTripStoreService, () => makeLastTripStore(storage));

export const makeLastTripStore = (storage: LastTripStorage) => {
  const listeners = new Set<() => void>();
  const initial = storage.load();
  let current = initial ? TripId.make(initial) : null;

  return {
    get: () => current,
    set: (next: TripId | null) => {
      if (next === current) return;
      current = next;
      storage.save(next);

      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const resolveEntry = (
  groups: ReadonlyArray<Pick<GroupListItem, "group" | "trips">>,
  lastTripId: TripId | null,
) => {
  if (lastTripId !== null) {
    const exists = groups.some((item) => item.trips.some((trip) => trip.id === lastTripId));

    if (exists) return { kind: "trip" as const, tripId: lastTripId };
  }

  const going = groups
    .flatMap((item) =>
      item.trips
        .filter((trip) => trip.endedAt === null)
        .map((trip) => ({ group: item.group, trip })),
    )
    .toSorted(
      (a, b) => DateTime.toEpochMillis(b.trip.startedAt) - DateTime.toEpochMillis(a.trip.startedAt),
    );

  if (going.length === 1) return { kind: "trip" as const, tripId: going[0]!.trip.id };

  if (going.length > 1) return { kind: "choose" as const, trips: going };

  return { kind: "groups" as const };
};

/**
 * The trip a group's pages put in scope: the one already in scope if it belongs to this group,
 * else the newest one still going, else the newest. Trips arrive newest first.
 */
export const tripInScope = <T extends Pick<Trip, "id" | "endedAt">>(
  trips: ReadonlyArray<T>,
  current: TripId | null,
) =>
  trips.find((trip) => trip.id === current) ??
  trips.find((trip) => trip.endedAt === null) ??
  trips[0];

/** The scope sheet's order: trips still going, then ended ones, each newest first. */
export const scopeTrips = <T extends Pick<Trip, "endedAt">>(trips: ReadonlyArray<T>) => [
  ...trips.filter((trip) => trip.endedAt === null),
  ...trips.filter((trip) => trip.endedAt !== null),
];

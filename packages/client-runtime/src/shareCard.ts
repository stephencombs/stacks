import * as DateTime from "effect/DateTime";
import { MinorUnits, type CurrencyCode, type PlayerId } from "@stacks/contracts";
import {
  playerTrip,
  tripNights,
  tripStandings,
  type TripClock,
  type TripSession,
} from "@stacks/shared/trips";

import { formatDay, formatDuration } from "./format.ts";
import { tripLines } from "./trip.ts";

/** The most standings a trip card shows before "+N more". */
export const CARD_ROWS = 8;

/**
 * What a card draws, with nothing left to decide. A hidden card has no amounts in it at all: the
 * `amounts` of a session and the `net` of a row are null, and so are a trip's `you.amounts`, its
 * climb copy and its line. A card can't show what the model doesn't hold, so hiding can't leak
 * through a tint, an axis or a label.
 */
export interface TripCardModel {
  readonly kind: "trip";
  readonly hidden: boolean;
  readonly name: string;
  readonly dates: string;
  readonly venues: ReadonlyArray<string>;
  readonly currency: CurrencyCode;
  readonly rows: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly rank: number;
    readonly name: string;
    readonly isYou: boolean;
    readonly net: MinorUnits | null;
  }>;
  /** Standings that didn't fit in `rows`. */
  readonly more: number;
  /** Null when you didn't play on the trip. */
  readonly you: {
    readonly rank: number;
    readonly sessions: number;
    readonly nights: number;
    readonly amounts: {
      readonly net: MinorUnits;
      readonly climb: string | null;
      readonly line: ReadonlyArray<number>;
    } | null;
  } | null;
}

export interface SessionCardModel {
  readonly kind: "session";
  readonly hidden: boolean;
  readonly venue: string | null;
  readonly game: string;
  readonly date: string;
  readonly duration: string;
  readonly currency: CurrencyCode;
  readonly amounts: {
    readonly result: MinorUnits;
    readonly buyIn: MinorUnits;
    readonly cashOut: MinorUnits;
    /** Null for a session too short to have an hourly result. */
    readonly hourly: MinorUnits | null;
  } | null;
}

export type CardModel = TripCardModel | SessionCardModel;

/** Privacy mode always hides; **Hide amounts** hides one card. */
export const cardHidden = (privacyMode: boolean, hideAmounts: boolean) =>
  privacyMode || hideAmounts;

export const tripCardModel = ({
  name,
  dates,
  venues,
  currency,
  me,
  closed,
  players,
  clock,
  hidden,
}: {
  readonly name: string;
  readonly dates: string;
  readonly venues: ReadonlyArray<string | null>;
  readonly currency: CurrencyCode;
  readonly me: PlayerId;
  /** Finished sessions and tables only. */
  readonly closed: ReadonlyArray<TripSession>;
  readonly players: ReadonlyArray<{ readonly id: PlayerId; readonly displayName: string }>;
  readonly clock: TripClock;
  readonly hidden: boolean;
}) => {
  const standings = tripStandings(closed, clock);
  const mine = playerTrip(closed, me);
  const mineIndex = standings.findIndex((standing) => standing.playerId === me);

  const top = standings.slice(0, CARD_ROWS);

  const shown =
    mineIndex < CARD_ROWS ? top : [...top.slice(0, CARD_ROWS - 1), standings[mineIndex]!];

  const rows = shown.map((standing) => ({
    playerId: standing.playerId,
    rank: standing.rank,
    name: players.find((player) => player.id === standing.playerId)?.displayName ?? "Player",
    isYou: standing.playerId === me,
    net: hidden ? null : MinorUnits.make(standing.net),
  }));

  return {
    kind: "trip" as const,
    hidden,
    name,
    dates,
    venues: [...new Set(venues.filter((venue) => venue !== null))],
    currency,
    rows,
    more: standings.length - shown.length,
    you:
      mineIndex === -1
        ? null
        : {
            rank: standings[mineIndex]!.rank,
            sessions: mine.played,
            nights: tripNights(closed, clock).filter((night) =>
              night.sessions.some((session) =>
                session.results.some((result) => result.playerId === me),
              ),
            ).length,
            amounts: hidden
              ? null
              : {
                  net: MinorUnits.make(mine.net),
                  climb: tripLines(mine, currency).climb,
                  line: mine.line,
                },
          },
  } satisfies TripCardModel;
};

export const sessionCardModel = ({
  venue,
  game,
  startedAt,
  finishedAt,
  currency,
  result,
  buyIn,
  cashOut,
  hourly,
  hidden,
}: {
  readonly venue: string | null;
  readonly game: string;
  readonly startedAt: DateTime.Utc;
  readonly finishedAt: DateTime.Utc;
  readonly currency: CurrencyCode;
  readonly result: MinorUnits;
  readonly buyIn: MinorUnits;
  readonly cashOut: MinorUnits;
  readonly hourly: number | null;
  readonly hidden: boolean;
}) =>
  ({
    kind: "session" as const,
    hidden,
    venue,
    game,
    date: formatDay(startedAt),
    duration: formatDuration(startedAt, finishedAt),
    currency,
    amounts: hidden
      ? null
      : { result, buyIn, cashOut, hourly: hourly === null ? null : MinorUnits.make(hourly) },
  }) satisfies SessionCardModel;

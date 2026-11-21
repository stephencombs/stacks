import type {
  CurrencyCode,
  GroupDetail,
  GroupId,
  GroupStats,
  MinorUnits,
  PlayerId,
  TripId,
  VenueId,
} from "@stacks/contracts";
import { groupAwards, groupStats, type AwardKey, type GroupAward } from "@stacks/shared/stats";
import { tripNights, type TripClock } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";

import { formatTime, playerNames } from "./format.ts";
import {
  filterChips,
  formatHours,
  gameChip,
  gameName,
  noMatch,
  played,
  statsTrips,
  type StatsFilters,
} from "./stats.ts";
import { boardMoney, chipOf, localClock } from "./trip.ts";

/** The Group chip: Just me, or one of your groups. */
export const groupChip = (
  groups: ReadonlyArray<{ readonly id: GroupId; readonly name: string }>,
  picked: GroupId | null,
) => ({
  name: "Group",
  value: picked ?? "",
  applied: picked !== null,
  options: [
    { value: "", label: "Just me" },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ],
});

export const awardTitles: Record<AwardKey, string> = {
  biggest_hit: "Biggest hit",
  heater: "Heater",
  comeback: "Comeback kid",
  hopper: "Casino hopper",
  night_owl: "Night owl",
};

const awardLine = (
  award: GroupAward,
  currency: CurrencyCode,
  casino: (id: VenueId) => string,
  timeZone: DateTime.TimeZone,
  moneyOptions: { readonly showCents?: boolean; readonly privacyMode?: boolean },
) => {
  switch (award.key) {
    case "biggest_hit":
      return `${boardMoney(award.value, currency, true, moneyOptions)}${award.play?.venueId ? ` at ${casino(award.play.venueId)}` : ""}`;
    case "heater":
      return `${award.value} winning sessions in a row`;
    case "comeback":
      return `Climbed ${boardMoney(award.value, currency, false, moneyOptions)} from their low`;
    case "hopper":
      return `Played ${award.value} different casinos`;
    case "night_owl":
      return `Sat down at ${award.play ? formatTime(award.play.startedAt, timeZone) : `${award.value}:00`}`;
  }
};

const winRate = (wins: number, sessions: number) =>
  sessions === 0 ? "—" : `${Math.round((wins * 100) / sessions)}%`;

/**
 * A group's stats as Stats shows them: the filter chips, then why there's nothing to show, or the
 * standings with each member's stat sheet, everyone's running result, a picked trip's awards, and
 * the group's result by game and casino. Counts current members and guests, who list last and
 * unranked until they play, and anyone else who played.
 */
export const groupStatsView = (
  stats: GroupStats,
  detail: GroupDetail,
  filters: StatsFilters,
  {
    timeZone = DateTime.zoneMakeLocal(),
    clock = localClock,
    showCents = false,
    privacyMode = false,
  }: {
    readonly timeZone?: DateTime.TimeZone;
    readonly clock?: TripClock;
    readonly showCents?: boolean;
    readonly privacyMode?: boolean;
  } = {},
) => {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const venues = new Map(stats.venues.map((venue) => [venue.id, venue]));

  const venueName = (id: VenueId | null) =>
    id === null ? "No casino set" : (venues.get(id)?.name ?? "Casino");

  const trips = new Map(detail.trips.map((trip) => [trip.id, trip.name]));
  const tripName = (id: TripId) => trips.get(id) ?? "Trip";

  const roster = detail.players
    .filter((player) => player.role !== null || player.claimCode !== null)
    .map((player) => player.id);

  const computed = groupStats(stats.plays, roster, timeZone, filters);

  const options = {
    ...computed.options,
    tripIds: [...new Set([...computed.options.tripIds, ...detail.trips.map((trip) => trip.id)])],
  };

  const head = {
    ...filterChips(filters, options, { venueName, tripName }),
    trips: statsTrips(stats.plays, detail.trips, filters, timeZone),
  };

  if (stats.plays.length === 0) return { ...head, kind: "empty" as const };

  if (computed.plays.length === 0)
    return {
      ...head,
      kind: "no_match" as const,
      sentence: noMatch(
        filters,
        venueName(filters.venueId ?? null),
        filters.tripId === undefined ? "" : tripName(filters.tripId),
      ),
    };

  const period =
    filters.tripId !== undefined
      ? tripName(filters.tripId)
      : filters.year === undefined
        ? "All time"
        : String(filters.year);

  const race = computed.plays.map((play) => ({
    session: { id: play.id, startedAt: play.startedAt },
    tripId: play.tripId,
    venue: play.venueId === null ? null : { id: play.venueId, name: venueName(play.venueId) },
    results: play.results,
  }));

  const nights =
    filters.tripId === undefined
      ? []
      : tripNights(race, clock).map((night) => ({
          first: night.sessions[0]!.session.id,
          label: `Day ${night.number}`,
          ids: new Set(night.sessions.map((s) => s.session.id)),
        }));

  const marks =
    filters.tripId === undefined
      ? race.flatMap((session, index) =>
          index === 0 || race[index - 1]!.tripId !== session.tripId
            ? [{ index, label: tripName(session.tripId) }]
            : [],
        )
      : nights.map((night) => ({
          index: race.findIndex((s) => s.session.id === night.first),
          label: night.label,
        }));

  const biggest = Math.max(...computed.byGame.map((row) => Math.abs(row.result)));
  const meta = (sessions: number) => `${sessions} ${sessions === 1 ? "session" : "sessions"}`;

  const guests = new Set(
    detail.players.filter((player) => player.userId === null).map((p) => p.id),
  );

  const bests = new Map<PlayerId, { result: MinorUnits; line: string }>();

  for (const play of computed.plays) {
    for (const { playerId, net } of play.results) {
      const best = bests.get(playerId);

      if (best && best.result >= net) continue;

      const day = DateTime.format(DateTime.setZone(play.endedAt, timeZone), {
        month: "short",
        day: "numeric",
      });

      bests.set(playerId, {
        result: net,
        line: play.venueId === null ? day : `${venueName(play.venueId)} · ${day}`,
      });
    }
  }

  return {
    ...head,
    kind: "stats" as const,
    title: period,
    currency,
    standings: computed.standings.map((row) => ({
      playerId: row.playerId,
      rank: row.rank,
      name: names.get(row.playerId) ?? "Someone",
      you: row.playerId === detail.myPlayerId,
      chip: chipOf(detail, row.playerId),
      guest: guests.has(row.playerId),
      best: bests.get(row.playerId),
      meta: row.sessions === 0 ? "No sessions" : played(row.sessions, row.hours),
      result: row.result,
      sheet: {
        result: row.result,
        sessions: row.sessions,
        hours: formatHours(row.hours),
        hourlyResult: row.hourlyResult,
        winRate: winRate(row.wins, row.sessions),
        winRateLine: `${row.wins} of ${row.sessions}`,
      },
    })),
    total: computed.result,
    sessions: computed.plays.length,
    race: {
      sessions: race.map((session) => ({
        ...session,
        where:
          filters.tripId === undefined
            ? tripName(session.tripId)
            : (nights.find((night) => night.ids.has(session.session.id))?.label ?? ""),
      })),
      marks,
    },
    awards:
      filters.tripId === undefined
        ? null
        : groupAwards(computed.plays, clock).map((award) => ({
            key: award.key,
            title: awardTitles[award.key],
            playerId: award.playerId,
            name: names.get(award.playerId) ?? "Someone",
            chip: chipOf(detail, award.playerId),
            line: awardLine(award, currency, venueName, timeZone, { showCents, privacyMode }),
          })),
    byGame:
      filters.game !== undefined
        ? null
        : computed.byGame.map((row) => ({
            key: row.game ?? "none",
            label: gameName(row.game),
            meta: meta(row.sessions),
            chip: gameChip(row.game),
            result: row.result,
            share: biggest === 0 ? 0 : Math.abs(row.result) / biggest,
            filters: { ...filters, game: row.game },
          })),
    byCasino:
      filters.venueId !== undefined
        ? null
        : computed.byCasino
            .toSorted((a, b) => b.sessions - a.sessions)
            .map((row) => ({
              key: row.venueId ?? "none",
              label: venueName(row.venueId),
              meta: meta(row.sessions),
              result: row.result,
              filters: { ...filters, venueId: row.venueId },
            })),
  };
};

export type GroupStatsView = ReturnType<typeof groupStatsView>;

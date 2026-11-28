import {
  MinorUnits,
  type CurrencyCode,
  type GroupDetail,
  type GroupId,
  type GroupStats,
  type PlayerId,
  type TripId,
  type VenueId,
} from "@stacks/contracts";
import {
  AWARDS_MIN_PLAYS,
  BREAKDOWNS_MIN_PLAYS,
  LEADER_MIN_PLAYERS,
  RETURN_SWITCH_MIN_PLAYERS,
  TOGETHER_MIN_PLAYS,
  TRIPS_LIST_MIN,
  TRIPS_SHOWN,
  TRIP_BARS_MAX,
  STAKES_SHOWN,
  additionalBuyIns,
  backingResults,
  coveredBy,
  groupAwards,
  groupRecords,
  groupSeatBreakdown,
  groupStats,
  lateNight,
  nightResults,
  returnStandings,
  sharedVsSolo,
  sweeps,
  tablemates,
  tripResults,
  tripWins,
  type AwardKey,
  type BarResult,
  type GroupAward,
  type GroupPlay,
  type TripResult,
} from "@stacks/shared/stats";
import type { TripClock } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import * as Predicate from "effect/Predicate";

import { formatTime, playerNames } from "./format.ts";
import {
  axisLabelled,
  filterChips,
  formatHours,
  gameChip,
  gameName,
  nightAxisLabel,
  nightName,
  noMatch,
  played,
  returnFigure,
  seatBucketLabel,
  statsTrips,
  type StatsFilters,
} from "./stats.ts";
import { boardMoney, localClock, ordinal } from "./trip.ts";

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

/**
 * A sentence with amounts in it. A screen draws each amount through `Money` and reads the whole
 * line aloud through the privacy-aware formatter, so no amount is ever printed as plain text.
 */
export type Line = ReadonlyArray<
  string | { readonly amount: MinorUnits; readonly tone: "result" | "plain" }
>;

export const lineText = (line: Line, money: (part: Exclude<Line[number], string>) => string) =>
  line.map((part) => (Predicate.isString(part) ? part : money(part))).join("");

/** A player as an avatar and a name: `name` is the avatar's, `label` is how a sentence says it. */
export interface Who {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly label: string;
  readonly you: boolean;
}

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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const joinNames = (labels: ReadonlyArray<string>) =>
  labels.length <= 2 ? labels.join(" and ") : `${labels.length} players`;

/**
 * A group's stats as Stats shows them: the filter chips, then why there's nothing to show, or the
 * hero (the group's result, by trip or by night), standings, what the crew did together, trips,
 * habits, records and the result by game and casino. Every section that has a floor is null below
 * it. Counts current members and guests, who list last and unranked until they play, and anyone
 * else who played.
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
  const me = detail.myPlayerId;
  const venues = new Map(stats.venues.map((venue) => [venue.id, venue]));

  const venueName = (id: VenueId | null) =>
    id === null ? "No casino set" : (venues.get(id)?.name ?? "Casino");

  const trips = new Map(detail.trips.map((trip) => [trip.id, trip.name]));
  const tripName = (id: TripId) => trips.get(id) ?? "Trip";

  const roster = detail.players
    .filter((player) => player.role !== null || player.claimCode !== null)
    .map((player) => player.id);

  const groupFilters: StatsFilters = { ...filters, seat: undefined };
  const computed = groupStats(stats.plays, roster, timeZone, groupFilters);

  const options = {
    ...computed.options,
    tripIds: [...new Set([...computed.options.tripIds, ...detail.trips.map((trip) => trip.id)])],
  };

  const head = {
    ...filterChips(groupFilters, options, { venueName, tripName }),
    trips: statsTrips(stats.plays, detail.trips, groupFilters, timeZone),
  };

  if (stats.plays.length === 0) return { ...head, kind: "empty" as const };

  if (computed.plays.length === 0)
    return {
      ...head,
      kind: "no_match" as const,
      sentence: noMatch(
        groupFilters,
        venueName(groupFilters.venueId ?? null),
        groupFilters.tripId === undefined ? "" : tripName(groupFilters.tripId),
      ),
    };

  const period =
    filters.tripId !== undefined
      ? tripName(filters.tripId)
      : filters.year === undefined
        ? "All time"
        : String(filters.year);

  const plays = computed.plays;

  const who = (playerId: PlayerId) => {
    const name = names.get(playerId) ?? "Someone";

    return {
      playerId,
      name,
      label: playerId === me ? "You" : name,
      you: playerId === me,
    } satisfies Who;
  };

  const shortDay = (at: DateTime.Utc) =>
    DateTime.format(DateTime.setZone(at, timeZone), { month: "short", day: "numeric" });

  const guests = new Set(
    detail.players.filter((player) => player.userId === null).map((p) => p.id),
  );

  const bests = new Map<PlayerId, { result: MinorUnits; line: string }>();

  for (const play of plays) {
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

  const returns = returnStandings(plays);

  const rates = new Map(
    returns.map((entry) => [entry.playerId, returnFigure(entry.result, entry.buyIn)]),
  );

  const standings = computed.standings.map((row) => ({
    playerId: row.playerId,
    rank: row.rank,
    name: names.get(row.playerId) ?? "Someone",
    you: row.playerId === me,
    guest: guests.has(row.playerId),
    best: bests.get(row.playerId),
    meta: row.sessions === 0 ? "No sessions" : played(row.sessions, row.hours),
    result: row.result,
    rate: rates.get(row.playerId) ?? null,
    sheet: {
      result: row.result,
      sessions: row.sessions,
      hours: formatHours(row.hours),
      hourlyResult: row.hourlyResult,
      winRate: winRate(row.wins, row.sessions),
      winRateLine: `${row.wins} of ${row.sessions}`,
    },
  }));

  const ranked = standings.filter((row) => row.rank !== null);
  const mine = standings.find((row) => row.playerId === me);
  const myRank = mine?.rank ?? null;

  const aheadRank =
    myRank === null ? 0 : Math.max(0, ...ranked.map((row) => row.rank!).filter((r) => r < myRank));

  const ahead = ranked.filter((row) => row.rank === aheadRank);

  const footnote: Line | null =
    mine === undefined || myRank === null
      ? null
      : myRank === 1
        ? [
            ranked.filter((row) => row.rank === 1).length > 1
              ? "You're tied for first"
              : "You're in front",
          ]
        : [
            `You're ${ordinal(myRank)}, `,
            { amount: MinorUnits.make(ahead[0]!.result - mine.result), tone: "plain" },
            ` behind ${joinNames(ahead.map((row) => row.name))}`,
          ];

  const buyIns = plays.reduce(
    (sum, play) => sum + play.results.reduce((n, result) => n + result.buyIn, 0),
    0,
  );

  const byReturn =
    returns.length < RETURN_SWITCH_MIN_PLAYERS
      ? null
      : [
          ...returns.map((entry) => {
            const rank: number | null = entry.rank;

            return {
              ...standings.find((row) => row.playerId === entry.playerId)!,
              rank,
            };
          }),
          ...standings
            .filter((row) => !returns.some((entry) => entry.playerId === row.playerId))
            .map((row) => ({ ...row, rank: null })),
        ];

  const slice =
    filters.game === undefined && filters.venueId === undefined
      ? null
      : [
          filters.game === undefined ? null : gameName(filters.game),
          filters.venueId === undefined ? null : venueName(filters.venueId),
        ]
          .filter((part) => part !== null)
          .join(" at ");

  const leadWords = (
    bar: BarResult,
    { final, night }: { readonly final: boolean; readonly night: boolean },
  ) => {
    if (bar.leaders.length === 0) return null;
    const leaders = bar.leaders.map(who);
    const name = joinNames(leaders.map((leader) => leader.label));
    const tied = leaders.length > 1;

    return {
      leaders,
      text: tied
        ? `${final ? "" : "Leading so far: "}${name} tied`
        : !final
          ? `Leading so far: ${name}`
          : slice !== null
            ? `Top in ${slice}: ${name}`
            : night
              ? `${name} led`
              : bar.leaderResult > 0
                ? `${name} won`
                : `Highest result: ${name}`,
      amount: tied ? null : bar.leaderResult,
    };
  };

  const money = (amount: MinorUnits) => ({ amount, tone: "result" }) satisfies Line[number];

  const allTrips = tripResults(plays, detail.trips);

  const tripOrder = (a: TripResult, b: TripResult) =>
    DateTime.toEpochMillis(b.startedAt) - DateTime.toEpochMillis(a.startedAt);

  const barFrom = (bar: BarResult, label: string, name: string, final: boolean, night: boolean) => {
    const lead = leadWords(bar, { final, night });

    return {
      key: bar.key,
      label,
      name,
      result: bar.result,
      status: !bar.played
        ? ("none" as const)
        : bar.result > 0
          ? ("up" as const)
          : bar.result < 0
            ? ("down" as const)
            : ("even" as const),
      leader: lead && lead.leaders.length === 1 ? lead.leaders[0]! : null,
      spoken: (bar.played
        ? [`${name}, `, money(bar.result), lead ? `. ${lead.text}.` : "."]
        : [`${name}, no play.`]) satisfies Line,
    };
  };

  const chart = (() => {
    if (filters.tripId !== undefined) {
      const nights = nightResults(plays, timeZone);

      if (nights === null) return null;
      const labelled = axisLabelled(nights.length);

      const bars = nights.map((night, index) => ({
        ...barFrom(
          night,
          labelled(index) ? nightAxisLabel(night.key, nights.length) : "",
          nightName(night.key),
          true,
          true,
        ),
        year: null,
        filters: null,
      }));

      return { by: "night" as const, title: "By night", bars, earlier: 0 };
    }

    if (allTrips.length < 2) return null;
    const shown = allTrips.slice(-TRIP_BARS_MAX);

    const bars = shown.map((trip, index) => {
      const start = DateTime.toParts(DateTime.setZone(trip.startedAt, timeZone));

      return {
        ...barFrom(
          trip,
          DateTime.format(DateTime.setZone(trip.startedAt, timeZone), { month: "short" }),
          tripName(trip.tripId),
          trip.ended,
          false,
        ),
        year:
          filters.year === undefined && (index === 0 || start.month === 1)
            ? String(start.year)
            : null,
        filters: { ...filters, tripId: trip.tripId, year: undefined } satisfies StatsFilters,
      };
    });

    return {
      by: "trip" as const,
      title: "Result by trip",
      bars,
      earlier: allTrips.length - shown.length,
    };
  })();

  const finishedTrips = allTrips.filter((trip) => trip.ended);

  const hero = {
    kicker: `Group result · ${period}`,
    players: ranked.length,
    tables: plays.length,
    result: computed.result,
    up:
      filters.tripId !== undefined || finishedTrips.length === 0
        ? null
        : {
            up: finishedTrips.filter((trip) => trip.result > 0).length,
            of: finishedTrips.length,
          },
    chart,
    place:
      myRank === null
        ? null
        : {
            label: `${ranked.filter((row) => row.rank === myRank).length > 1 ? "=" : ""}${ordinal(myRank)}`,
            of: ranked.length,
          },
    yours: myRank === null ? null : mine!.result,
    returnRate: returnFigure(computed.result, buyIns),
  };

  const tripRows = (list: ReadonlyArray<TripResult>) =>
    list.map((trip) => {
      const lead = leadWords(trip, { final: trip.ended, night: false })!;

      return {
        key: trip.tripId,
        name: tripName(trip.tripId),
        leaders: lead.leaders,
        line: [
          lead.text,
          ...(lead.amount === null ? [] : [" ", money(lead.amount)]),
          ` · ${plural(trip.tables, "table")}`,
        ] satisfies Line,
        result: trip.result,
        filters: { ...filters, tripId: trip.tripId, year: undefined } satisfies StatsFilters,
      };
    });

  const listed = allTrips.filter((trip) => trip.players >= LEADER_MIN_PLAYERS);

  const rows = tripRows([
    ...listed.filter((trip) => !trip.ended).toSorted(tripOrder),
    ...listed.filter((trip) => trip.ended).toSorted(tripOrder),
  ]);

  const wins = tripWins(allTrips);

  const tripList =
    filters.tripId !== undefined || rows.length < TRIPS_LIST_MIN
      ? null
      : {
          wins: wins.leader
            ? `${who(wins.leader.playerId).label} ${slice === null ? "won" : "led"} ${wins.leader.wins} of ${wins.ended}`
            : null,
          rows: rows.slice(0, TRIPS_SHOWN),
          all: rows.length > TRIPS_SHOWN ? rows : null,
        };

  const mates = tablemates(plays, me);
  const sweep = sweeps(plays);
  const split = sharedVsSolo(plays);
  const late = lateNight(plays, clock);
  const records = groupRecords(plays);

  const rowOf = (
    key: string,
    people: ReadonlyArray<Who>,
    title: string,
    line: Line,
    trailing: Line | null = null,
  ) => ({ key, people, title, line, trailing });

  const ordered = (ids: readonly [PlayerId, PlayerId]) =>
    (ids[1] === me ? [ids[1], ids[0]] : ids).map(who);

  const together = [
    ...(mates.pair
      ? (() => {
          const [first, second] = ordered(mates.pair.playerIds);

          return [
            rowOf(
              "pair",
              [first!, second!],
              `${first!.label} and ${second!.label}`,
              [`${mates.pair.tables} tables together`],
              [money(mates.pair.result)],
            ),
          ];
        })()
      : []),
    ...(mates.withWithout
      ? (() => {
          const friend = who(mates.withWithout.friend);

          return [
            rowOf("with", [friend], `At tables with ${friend.label}`, [
              "You averaged ",
              money(mates.withWithout.withAverage),
              ` with ${friend.label} (${mates.withWithout.withCount}), `,
              money(mates.withWithout.withoutAverage),
              ` without (${mates.withWithout.withoutCount})`,
            ]),
          ];
        })()
      : []),
    ...(mates.headToHead
      ? (() => {
          const friend = who(mates.headToHead.friend);

          return [
            rowOf("versus", [friend], `You vs ${friend.label}`, [
              `Finished higher: you ${mates.headToHead.ahead}, ${friend.label} ${mates.headToHead.behind}, ${mates.headToHead.tied} tied.`,
            ]),
          ];
        })()
      : []),
    ...(sweep
      ? [
          rowOf(
            "sweep",
            [],
            "Everyone finished up",
            [
              `${plural(sweep.count, "table")} · ${sweep.count > 1 ? "best: " : ""}${[
                sweep.play.game === null ? null : gameName(sweep.play.game),
                sweep.play.venueId === null ? null : venueName(sweep.play.venueId),
                shortDay(sweep.play.startedAt),
              ]
                .filter((part) => part !== null)
                .join(" · ")}`,
            ],
            [money(sweep.result)],
          ),
        ]
      : []),
    ...(split
      ? [
          rowOf("split", [], "Shared tables vs solo", [
            "Averaged ",
            money(split.shared.average),
            ` an appearance at shared tables (${split.shared.plays}), `,
            money(split.solo.average),
            ` with one recorded group player (${split.solo.plays})`,
          ]),
        ]
      : []),
  ];

  const reloads = stats.reloads === undefined ? null : additionalBuyIns(plays, stats.reloads);

  const reloadRow = (() => {
    if (reloads === null) return [];
    const scoped = new Set(plays.map((play) => play.id));

    const visits = stats.allVisits
      ?.filter((item) => scoped.has(item.playId))
      .reduce((sum, item) => sum + item.visits, 0);

    return [
      rowOf(
        "reload",
        [],
        "With additional buy-ins",
        [
          `${reloads.finishedUp} of ${reloads.visits} visits with an additional buy-in finished up`,
          reloads.most === null
            ? ""
            : ` · ${who(reloads.most.playerId).label} added the most (${reloads.most.additional})`,
          visits === undefined || visits < reloads.visits
            ? ""
            : ` · ${reloads.visits} of ${visits} visits had one`,
        ],
        [money(reloads.result)],
      ),
    ];
  })();

  const habits = late
    ? [
        rowOf(
          "late",
          [],
          "After midnight",
          [
            "Averaged ",
            money(late.late.average),
            ` an appearance after midnight (${late.late.appearances}), `,
            money(late.other.average),
            ` at other start times (${late.other.appearances})`,
          ],
          [money(late.late.result)],
        ),
      ]
    : [];

  const habitRows = [...reloadRow, ...habits];

  const covered = stats.covered === undefined ? null : coveredBy(plays, stats.covered);

  const stakeTrips =
    filters.tripId !== undefined
      ? new Set([filters.tripId])
      : filters.year === undefined
        ? null
        : new Set(
            groupStats(stats.plays, [], timeZone, { year: filters.year }).plays.map(
              (play) => play.tripId,
            ),
          );

  const stakeRows = (
    stats.stakes === undefined ? [] : backingResults(stats.stakes, stakeTrips)
  ).map((stake) => {
    const lender = who(stake.lenderId);
    const borrower = who(stake.borrowerId);

    return rowOf(
      stake.stakeId,
      [lender, borrower],
      `${lender.label} backed ${borrower.playerId === me ? "you" : borrower.label}`,
      [
        { amount: stake.amount, tone: "plain" },
        ` on ${tripName(stake.tripId)}${stake.final ? "" : " · so far"}`,
      ],
      [money(stake.result)],
    );
  });

  const backing =
    covered === null && stakeRows.length === 0
      ? null
      : {
          whole: slice !== null && stakeRows.length > 0,
          covered:
            covered === null
              ? null
              : {
                  ...rowOf(
                    "covered",
                    [who(covered.payerId)],
                    `${who(covered.payerId).label} covered the most`,
                    [
                      `${plural(covered.entries, "buy-in")} for ${plural(covered.friends, "friend")}`,
                    ],
                    [{ amount: covered.amount, tone: "plain" }],
                  ),
                  tripId: filters.tripId ?? null,
                },
          stakes:
            stakeRows.length === 0
              ? null
              : {
                  rows: stakeRows.slice(0, STAKES_SHOWN),
                  all: stakeRows.length > STAKES_SHOWN ? stakeRows : null,
                },
        };

  const recordLine = (playerId: PlayerId, play: GroupPlay) =>
    [who(playerId).label, play.game === null ? null : gameName(play.game), shortDay(play.startedAt)]
      .filter((part) => part !== null)
      .join(" · ");

  const recordRows = records
    ? [
        ...(records.win
          ? [
              rowOf(
                "win",
                [who(records.win.playerId)],
                "Biggest win",
                [recordLine(records.win.playerId, records.win.play)],
                [money(MinorUnits.make(records.win.value))],
              ),
            ]
          : []),
        ...(records.loss
          ? [
              rowOf(
                "loss",
                [who(records.loss.playerId)],
                "Biggest loss",
                [recordLine(records.loss.playerId, records.loss.play)],
                [money(MinorUnits.make(records.loss.value))],
              ),
            ]
          : []),
        ...(records.longest
          ? [
              rowOf(
                "longest",
                [who(records.longest.playerId)],
                "Most time at one table",
                [recordLine(records.longest.playerId, records.longest.play)],
                [formatHours(records.longest.value / 3_600_000)],
              ),
            ]
          : []),
        ...(records.hourly
          ? [
              rowOf(
                "hourly",
                [who(records.hourly.playerId)],
                "Best per hour",
                [
                  `${who(records.hourly.playerId).label} · ${formatHours(records.hourly.milliseconds / 3_600_000)} played`,
                ],
                [money(MinorUnits.make(records.hourly.value)), "/hr"],
              ),
            ]
          : []),
      ]
    : [];

  const tables = (count: number, appearances: number) =>
    `${plural(count, "table")} · ${plural(appearances, "appearance")}`;

  const seatRows = stats.seats === undefined ? [] : groupSeatBreakdown(plays, stats.seats);

  const blackjackPlays = plays.reduce(
    (sum, play) => sum + (play.game === "blackjack" ? play.results.length : 0),
    0,
  );

  const seatedPlays = seatRows.reduce((sum, row) => sum + row.sessions, 0);

  return {
    ...head,
    kind: "stats" as const,
    title: period,
    currency,
    sessions: plays.length,
    hero,
    standings,
    byReturn,
    footnote,
    together: plays.length < TOGETHER_MIN_PLAYS || together.length === 0 ? null : together,
    tripList,
    awards:
      groupFilters.tripId === undefined || plays.length < AWARDS_MIN_PLAYS
        ? null
        : groupAwards(plays, clock).map((award) => ({
            key: award.key,
            title: awardTitles[award.key],
            playerId: award.playerId,
            name: names.get(award.playerId) ?? "Someone",
            you: award.playerId === me,
            line: awardLine(award, currency, venueName, timeZone, { showCents, privacyMode }),
          })),
    habits: habitRows.length === 0 ? null : habitRows,
    backing,
    records: recordRows.length === 0 ? null : recordRows,
    byGame:
      groupFilters.game !== undefined || plays.length < BREAKDOWNS_MIN_PLAYS
        ? null
        : computed.byGame.map((row) => ({
            key: row.game ?? "none",
            label: gameName(row.game),
            meta: tables(row.sessions, row.appearances),
            chip: gameChip(row.game),
            result: row.result,
            filters: { ...groupFilters, game: row.game },
          })),
    bySeat:
      seatRows.length === 0
        ? null
        : {
            count:
              seatedPlays < blackjackPlays
                ? `${seatedPlays} of ${blackjackPlays} blackjack plays`
                : undefined,
            rows: seatRows.map((row) => ({
              key: String(row.seat),
              label: seatBucketLabel(row.seat),
              meta: `${plural(row.sessions, "play")} · ${formatHours(row.hours)}`,
              result: row.result,
            })),
          },
    byCasino:
      groupFilters.venueId !== undefined || plays.length < BREAKDOWNS_MIN_PLAYS
        ? null
        : computed.byCasino
            .toSorted((a, b) => b.sessions - a.sessions)
            .map((row) => ({
              key: row.venueId ?? "none",
              label: venueName(row.venueId),
              meta: tables(row.sessions, row.appearances),
              result: row.result,
              filters: { ...groupFilters, venueId: row.venueId },
            })),
  };
};

export type GroupStatsView = ReturnType<typeof groupStatsView>;

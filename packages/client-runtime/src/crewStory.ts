import type { Game, PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { nameList } from "./crew.ts";
import { tellApart } from "./format.ts";

/** A person in a feed post. `you` marks the signed-in user's own player; `key` is unique in the post. */
export interface StoryFace {
  readonly key: string;
  readonly playerId: PlayerId | null;
  readonly displayName: string;
  readonly you: boolean;
}

/** A face with what they won or lost, in minor units. */
export interface StoryResult extends StoryFace {
  readonly net: number;
}

/**
 * A headline in three parts so the amount in the middle can be drawn with `Money`. The amount is a
 * magnitude: the words before it carry the sign.
 */
export interface StoryHeadline {
  readonly before: string;
  readonly amount: { readonly value: number; readonly tone: "win" | "loss" } | null;
  readonly after: string;
}

/**
 * A finished session or table as a post: a headline naming the standout, who sat beside them, and
 * how many more there were than faces to show. `lead` is null when no one stands out.
 */
export interface FinishedStory {
  readonly headline: StoryHeadline;
  readonly lead: StoryFace | null;
  readonly rest: ReadonlyArray<StoryResult>;
  readonly more: number;
}

/** A live session or table as a post. */
export interface LiveStory {
  readonly headline: string;
  readonly lead: StoryFace | null;
}

const MAX_FACES = 4;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const toFace = (
  player: { readonly playerId: PlayerId | null; readonly displayName: string },
  seat: number,
  me: PlayerId | undefined,
) =>
  ({
    key: player.playerId ?? `guest-${seat}`,
    playerId: player.playerId,
    displayName: player.displayName,
    you: player.playerId !== null && player.playerId === me,
  }) satisfies StoryFace;

const faceOf = ({ key, playerId, displayName, you }: StoryFace) =>
  ({ key, playerId, displayName, you }) satisfies StoryFace;

const speaker = (face: StoryFace) => (face.you ? "You" : face.displayName);

const namesOf = (faces: ReadonlyArray<StoryFace>) => nameList(tellApart(faces.map(speaker)));

const alone = { rest: [], more: 0 } as const;

const beside = (others: ReadonlyArray<StoryResult>) => {
  if (others.every((other) => other.net === 0)) return alone;

  const shown = others.length <= MAX_FACES + 1 ? others.length : MAX_FACES;

  return { rest: others.slice(0, shown), more: others.length - shown };
};

const line = (text: string) => ({ before: text, amount: null, after: "" }) satisfies StoryHeadline;

const withAmount = (before: string, value: number, tone: "win" | "loss", after: string) =>
  ({ before, amount: { value, tone }, after }) satisfies StoryHeadline;

const byNetDescending = (a: StoryResult, b: StoryResult) => b.net - a.net;

/**
 * The post for a finished session or table. It says only what the numbers support: a winner wins,
 * a table where no one won and several lost has a rough night, and even results get one quiet
 * line. Hidden amounts (privacy mode) get a line with no result in it at all, so it can't leak one.
 */
export const finishedStory = (
  players: ReadonlyArray<{
    readonly playerId: PlayerId | null;
    readonly displayName: string;
    readonly net: number;
  }>,
  options: { readonly venue: string; readonly me: PlayerId | undefined; readonly hidden: boolean },
) => {
  const results = players.map((player, seat) => ({
    ...toFace(player, seat, options.me),
    net: player.net,
  }));

  const at = ` at ${options.venue}`;
  const first = results[0];

  if (first === undefined) {
    return { headline: line(`Finished${at}`), lead: null, ...alone } satisfies FinishedStory;
  }

  if (options.hidden) {
    return {
      headline: line(`${namesOf(results)} played${at}`),
      lead: faceOf(first),
      ...alone,
    } satisfies FinishedStory;
  }

  const winners = results.filter((result) => result.net > 0);
  const losers = results.filter((result) => result.net < 0);

  if (winners.length > 0) {
    const top = Math.max(...winners.map((winner) => winner.net));
    const leaders = winners.filter((winner) => winner.net === top);
    const verb = leaders.length > 1 ? "each won" : "won";

    return {
      headline: withAmount(`${namesOf(leaders)} ${verb} `, top, "win", at),
      lead: faceOf(leaders[0] ?? first),
      ...beside(results.filter((result) => !leaders.includes(result)).toSorted(byNetDescending)),
    } satisfies FinishedStory;
  }

  const [loser] = losers;

  if (loser === undefined) {
    return {
      headline: line(
        results.length === 1 ? `${speaker(first)} broke even${at}` : `Everyone broke even${at}`,
      ),
      lead: results.length === 1 ? faceOf(first) : null,
      ...alone,
    } satisfies FinishedStory;
  }

  if (losers.length === 1) {
    return {
      headline: withAmount(`${speaker(loser)} lost `, Math.abs(loser.net), "loss", at),
      lead: faceOf(loser),
      ...beside(results.filter((result) => result !== loser)),
    } satisfies FinishedStory;
  }

  const lost = losers.reduce((sum, result) => sum - result.net, 0);

  return {
    headline: withAmount(`Rough night${at}: the table lost `, lost, "loss", ""),
    lead: null,
    ...beside(results.toSorted((a, b) => a.net - b.net)),
  } satisfies FinishedStory;
};

const PLAYING = {
  slots: "slots",
  blackjack: "blackjack",
  roulette: "roulette",
  craps: "craps",
  baccarat: "baccarat",
  poker_cash: "poker",
  poker_tourney: "a poker tournament",
  other: null,
} as const satisfies Record<Game, string | null>;

/** "Bruce, Nick and 2 others are playing blackjack at Caesars Palace". */
export const liveStory = (
  players: ReadonlyArray<{ readonly playerId: PlayerId | null; readonly displayName: string }>,
  options: {
    readonly venue: string;
    readonly game: Game | null;
    readonly me: PlayerId | undefined;
  },
) => {
  const faces = players.map((player, seat) => toFace(player, seat, options.me));
  const [first] = faces;
  const verb = faces.length <= 1 && !first?.you ? "is" : "are";
  const what = options.game === null ? null : PLAYING[options.game];

  return {
    headline: `${namesOf(faces) || "Someone"} ${verb} playing${what ? ` ${what}` : ""} at ${options.venue}`,
    lead: first ?? null,
  } satisfies LiveStory;
};

/**
 * What a screen reader hears for a finished post: the headline, then each face's name and result.
 * `format` writes a magnitude in the group's currency; wins and losses are said in words, since a
 * sign isn't read out reliably.
 */
export const storyText = (story: FinishedStory, format: (amount: number) => string) => {
  const { before, amount, after } = story.headline;
  const headline = `${before}${amount ? format(amount.value) : ""}${after}`;

  const said = (net: number) =>
    net > 0 ? `won ${format(net)}` : net < 0 ? `lost ${format(-net)}` : "broke even";

  const others = [
    ...story.rest.map((result) => `${speaker(result)} ${said(result.net)}`),
    ...(story.more > 0 ? [`${story.more} more`] : []),
  ];

  return others.length > 0 ? `${headline}. ${others.join(", ")}` : headline;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const calendarDay = (value: DateTime.Utc, zone: DateTime.TimeZone) => {
  const { year, month, day } = DateTime.toParts(DateTime.setZone(value, zone));

  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
};

/**
 * When a post happened, the way a feed says it: "Just now", "5m ago", "2h ago", "Yesterday", the
 * weekday inside the last week ("Tue"), then the date. Days are the viewer's own.
 */
export const relativeWhen = (
  at: DateTime.Utc,
  now: DateTime.Utc,
  zone: DateTime.TimeZone = DateTime.zoneMakeLocal(),
) => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at);

  if (elapsed < MINUTE) return "Just now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;

  const days = calendarDay(now, zone) - calendarDay(at, zone);

  if (days <= 0 || elapsed < 12 * HOUR) return `${Math.floor(elapsed / HOUR)}h ago`;

  if (days === 1) return "Yesterday";

  const { year, month, day, weekDay } = DateTime.toParts(DateTime.setZone(at, zone));

  if (days < 7) return WEEKDAYS[weekDay] ?? "";

  const date = `${MONTHS[month - 1]} ${day}`;

  return year === DateTime.toParts(DateTime.setZone(now, zone)).year ? date : `${date}, ${year}`;
};

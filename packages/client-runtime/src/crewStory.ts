import type { Game, PlayerId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { nameList } from "./crew.ts";
import { tellApart } from "./format.ts";

/**
 * A group member in a feed post. `name` is what a sentence calls them: "You" for the signed-in
 * user, else their display name, numbered when two members share one. `displayName` is for avatars.
 */
export interface StoryFace {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly name: string;
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
 * A finished session or table as a post: a headline, the member who stands out, and the others
 * with their results. `lead` is null unless exactly one member stands out.
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

type Player = { readonly playerId: PlayerId | null; readonly displayName: string };

const MAX_SHOWN = 4;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

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

const members = <P extends Player>(players: ReadonlyArray<P>) =>
  players.flatMap((player) =>
    player.playerId === null ? [] : [{ ...player, playerId: player.playerId }],
  );

const namedFaces = <P extends Player & { readonly playerId: PlayerId }>(
  players: ReadonlyArray<P>,
  me: PlayerId | undefined,
) => {
  const names = tellApart(players.map((player) => player.displayName));

  return players.map((player, seat) => ({
    ...player,
    name: player.playerId === me ? "You" : (names[seat] ?? player.displayName),
    you: player.playerId === me,
  }));
};

const youFirst = <F extends StoryFace>(faces: ReadonlyArray<F>) => [
  ...faces.filter((face) => face.you),
  ...faces.filter((face) => !face.you),
];

const listed = (faces: ReadonlyArray<StoryFace>) =>
  nameList(youFirst(faces).map((face) => face.name));

const faceOf = ({ playerId, displayName, name, you }: StoryFace) =>
  ({ playerId, displayName, name, you }) satisfies StoryFace;

const alone = { rest: [], more: 0 } as const;

const beside = (others: ReadonlyArray<StoryResult>) => {
  if (others.every((other) => other.net === 0)) return alone;

  const shown = others.length <= MAX_SHOWN + 1 ? others.length : MAX_SHOWN;

  return { rest: others.slice(0, shown), more: others.length - shown };
};

const line = (text: string) => ({ before: text, amount: null, after: "" }) satisfies StoryHeadline;

const withAmount = (before: string, value: number, tone: "win" | "loss", after: string) =>
  ({ before, amount: { value, tone }, after }) satisfies StoryHeadline;

const playedWith = (game: Game | null) => (game === null ? null : PLAYING[game]);

const where = (venue: string | null, playing: string | null) => {
  if (venue !== null) return ` at ${venue}`;

  return playing === null ? " at a table" : ` playing ${playing}`;
};

const byNet = (a: StoryResult, b: StoryResult) => b.net - a.net;

/**
 * The post for a finished session or table, about group members only: someone who isn't one is
 * neither named nor counted, so a post agrees with Crew's "N playing". It says only what the
 * numbers support. When no one won and several lost, the table lost. Otherwise the largest result,
 * a win or a loss, is the headline, and a face leads only when one member has it alone. Hidden
 * amounts (privacy mode) get a line with no result in it at all, so it can't leak one.
 */
export const finishedStory = (
  players: ReadonlyArray<{
    readonly playerId: PlayerId | null;
    readonly displayName: string;
    readonly net: number;
  }>,
  options: {
    readonly venue: string | null;
    readonly game: Game | null;
    readonly me: PlayerId | undefined;
    readonly hidden: boolean;
  },
) => {
  const results = namedFaces(members(players), options.me);
  const playing = playedWith(options.game);
  const at = where(options.venue, playing);
  const first = youFirst(results)[0];

  if (first === undefined) {
    return { headline: line(`Finished${at}`), lead: null, ...alone } satisfies FinishedStory;
  }

  if (options.hidden) {
    return {
      headline: line(
        `${listed(results)} played${options.venue === null && playing !== null ? ` ${playing}` : at}`,
      ),
      lead: faceOf(first),
      ...alone,
    } satisfies FinishedStory;
  }

  const winners = results.filter((result) => result.net > 0);
  const losers = results.filter((result) => result.net < 0);

  if (winners.length === 0 && losers.length === 0) {
    return {
      headline: line(
        results.length === 1 ? `${first.name} broke even${at}` : `Everyone broke even${at}`,
      ),
      lead: results.length === 1 ? faceOf(first) : null,
      ...alone,
    } satisfies FinishedStory;
  }

  if (winners.length === 0 && losers.length > 1) {
    const lost = losers.reduce((sum, result) => sum - result.net, 0);

    return {
      headline: withAmount("The table lost ", lost, "loss", at),
      lead: null,
      ...beside(results.toSorted((a, b) => a.net - b.net)),
    } satisfies FinishedStory;
  }

  const top = Math.max(...results.map((result) => Math.abs(result.net)));
  const standouts = results.filter((result) => Math.abs(result.net) === top);
  const named = standouts.some((result) => result.net > 0) ? winners : losers;
  const group = standouts.filter((result) => named.includes(result));
  const won = group.some((result) => result.net > 0);
  const verb = `${group.length > 1 ? "each " : ""}${won ? "won" : "lost"}`;

  return {
    headline: withAmount(`${listed(group)} ${verb} `, top, won ? "win" : "loss", at),
    lead: standouts.length === 1 ? faceOf(group[0] ?? first) : null,
    ...beside(results.filter((result) => !group.includes(result)).toSorted(byNet)),
  } satisfies FinishedStory;
};

/** "Bruce, Nick and 2 others are playing blackjack at Caesars Palace", about group members only. */
export const liveStory = (
  players: ReadonlyArray<Player>,
  options: {
    readonly venue: string;
    readonly game: Game | null;
    readonly me: PlayerId | undefined;
  },
) => {
  const faces = youFirst(namedFaces(members(players), options.me));
  const [first] = faces;
  const verb = faces.length <= 1 && !first?.you ? "is" : "are";
  const what = playedWith(options.game);

  return {
    headline: `${listed(faces) || "Someone"} ${verb} playing${what ? ` ${what}` : ""} at ${options.venue}`,
    lead: first ? faceOf(first) : null,
  } satisfies LiveStory;
};

/**
 * What a screen reader hears for a finished post: the headline, then each member's name and result.
 * `format` writes a magnitude in the group's currency; wins and losses are said in words, since a
 * sign isn't read out reliably.
 */
export const storyText = (story: FinishedStory, format: (amount: number) => string) => {
  const { before, amount, after } = story.headline;
  const headline = `${before}${amount ? format(amount.value) : ""}${after}`;

  const said = (net: number) =>
    net > 0 ? `won ${format(net)}` : net < 0 ? `lost ${format(-net)}` : "broke even";

  const others = [
    ...story.rest.map((result) => `${result.name} ${said(result.net)}`),
    ...(story.more > 0 ? [`${story.more} more`] : []),
  ];

  return others.length > 0 ? `${headline}. ${others.join(", ")}` : headline;
};

const calendarDay = (value: DateTime.Zoned) => {
  const { year, month, day } = DateTime.toParts(value);

  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
};

/**
 * When a post happened, the way a feed says it: "Just now", "5m ago", "2h ago", "Yesterday", the
 * weekday inside the last week ("Tue"), then the date. Days are the viewer's own, in `zone`.
 */
export const relativeWhen = (at: DateTime.Utc, now: DateTime.Utc, zone: DateTime.TimeZone) => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at);

  if (elapsed < MINUTE) return "Just now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;

  const then = DateTime.setZone(at, zone);
  const today = DateTime.setZone(now, zone);
  const days = calendarDay(today) - calendarDay(then);

  if (days <= 0 || elapsed < 12 * HOUR) return `${Math.floor(elapsed / HOUR)}h ago`;

  if (days === 1) return "Yesterday";

  if (days < 7) return DateTime.format(then, { weekday: "short" });

  return DateTime.format(
    then,
    DateTime.toParts(then).year === DateTime.toParts(today).year
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
};

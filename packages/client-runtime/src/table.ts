import { MinorUnits, type CurrencyCode, type PlayerId } from "@stacks/contracts";
import { minorUnitDigits } from "@stacks/shared/money";

// ---- The art ------------------------------------------------------------------------------------

/** Where a seat is in one rendered frame, as fractions of the frame; `e` is the angle it's seen from. */
export interface SeatAnchor {
  readonly x: number;
  readonly y: number;
  /** A seated player's chip: its radius as a fraction of the frame's width. */
  readonly r: number;
  readonly e: number;
  /** The seat's betting circle, where its stack sits. */
  readonly bx: number;
  readonly by: number;
  readonly br: number;
  readonly be: number;
}

/** One chip angle: where the chip touches the felt in its image, and how wide the image is in chips. */
export interface ChipSprite {
  readonly ox: number;
  readonly oy: number;
  readonly k: number;
  readonly aspect: number;
}

/**
 * A table pre-rendered from camera angles along one path, from overhead (frame 0) down to the
 * rail, with chips rendered at angles `chipLevels` apart. See tools/table-art.
 */
export interface TableArt {
  readonly aspect: number;
  readonly elevations: ReadonlyArray<number>;
  readonly chipLevels: ReadonlyArray<number>;
  readonly frames: ReadonlyArray<{
    readonly rail: boolean;
    readonly seats: ReadonlyArray<SeatAnchor>;
  }>;
  readonly chips: Readonly<Record<string, ChipSprite>>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The rendered frame nearest an elevation. */
export const frameAt = (art: TableArt, degrees: number) =>
  art.elevations.reduce(
    (best, e, i) => (Math.abs(e - degrees) < Math.abs(art.elevations[best]! - degrees) ? i : best),
    0,
  );

/** Seat anchors between rendered frames, following the camera as it moves. */
export const anchorsAt = (art: TableArt, f: number): ReadonlyArray<SeatAnchor> => {
  const i = clamp(Math.floor(f), 0, art.frames.length - 2);
  const t = clamp(f - i, 0, 1);
  const next = art.frames[i + 1]!.seats;
  return art.frames[i]!.seats.map((a, n) => {
    const b = next[n]!;
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      r: lerp(a.r, b.r, t),
      e: lerp(a.e, b.e, t),
      bx: lerp(a.bx, b.bx, t),
      by: lerp(a.by, b.by, t),
      br: lerp(a.br, b.br, t),
      be: lerp(a.be, b.be, t),
    };
  });
};

/** The two rendered chip angles around `degrees`, and how far between them it is. */
export const chipAngles = (art: TableArt, degrees: number) => {
  const levels = art.chipLevels;
  const e = clamp(degrees, levels[0]!, levels[levels.length - 1]!);
  const i = clamp(
    levels.findLastIndex((l) => l <= e),
    0,
    levels.length - 2,
  );
  return {
    low: levels[i]!,
    high: levels[i + 1]!,
    t: (e - levels[i]!) / (levels[i + 1]! - levels[i]!),
  };
};

/** One chip's thickness on screen, in chip diameters: the edge of a chip 0.2 diameters thick. */
export const chipEdge = (degrees: number) => 0.1 * Math.cos((degrees * Math.PI) / 180);

/** How a seat is read out: numbered from the dealer's left, with blackjack's names for the ends. */
export const seatLabel = (seat: number, seats: number) =>
  seat === 1 ? "Seat 1, first base" : seat === seats ? `Seat ${seat}, third base` : `Seat ${seat}`;

// ---- Chips in play --------------------------------------------------------------------------------

/** Casino chips by value in whole units of the currency, and the art's chip color for each. */
const DENOMINATIONS = [
  { value: 1000, chip: 8 },
  { value: 500, chip: 5 },
  { value: 100, chip: 4 },
  { value: 25, chip: 3 },
  { value: 5, chip: 1 },
] as const;

/**
 * The stack a player would hold for what they have in play: the biggest chip that still makes a
 * stack of three or more, the way a dealer colors you up. Up to ten chips; nothing for zero.
 */
export const stackOf = (amount: number, currency: CurrencyCode) => {
  if (amount <= 0) return { chip: 0, count: 0 };
  const whole = amount / 10 ** minorUnitDigits(currency);
  const d = DENOMINATIONS.find((x) => whole / x.value >= 3) ?? DENOMINATIONS[4];
  return { chip: d.chip, count: clamp(Math.round(whole / d.value), 1, 10) };
};

// ---- What the table shows --------------------------------------------------------------------------

export interface SeatView {
  readonly seat: number;
  readonly playerId: PlayerId;
  /** In play: what they've bought in for, while they're still playing. */
  readonly inPlay: MinorUnits;
  /** Their result once they've cashed out; null while playing. */
  readonly out: {
    readonly net: MinorUnits;
    readonly cashOut: MinorUnits;
    readonly buyIn: MinorUnits;
  } | null;
}

export interface TableView {
  readonly closed: boolean;
  /** By seat number. */
  readonly seats: ReadonlyArray<SeatView>;
}

export const tableView = (input: {
  readonly closed: boolean;
  readonly seats: ReadonlyMap<PlayerId, number>;
  readonly results: ReadonlyMap<
    PlayerId,
    { readonly buyIn: MinorUnits; readonly cashOut: MinorUnits; readonly net: MinorUnits }
  >;
  readonly cashedOut: ReadonlySet<PlayerId>;
}): TableView => ({
  closed: input.closed,
  seats: Array.from(input.seats, ([playerId, seat]) => {
    const result = input.results.get(playerId);
    const done = input.closed || input.cashedOut.has(playerId);
    return {
      seat,
      playerId,
      inPlay: done ? MinorUnits.make(0) : (result?.buyIn ?? MinorUnits.make(0)),
      out:
        done && result ? { net: result.net, cashOut: result.cashOut, buyIn: result.buyIn } : null,
    };
  }).toSorted((a, b) => a.seat - b.seat),
});

/** A cash-out of three times what went in gets the big-hit shot. */
const BIG_HIT = 3;

export type TableEvent =
  | { readonly kind: "sit"; readonly seat: SeatView }
  | { readonly kind: "stand"; readonly seat: SeatView }
  | { readonly kind: "move"; readonly from: SeatView; readonly to: SeatView }
  | { readonly kind: "stack"; readonly from: SeatView; readonly to: SeatView }
  | { readonly kind: "cashOut"; readonly seat: SeatView; readonly big: boolean }
  | { readonly kind: "bust"; readonly seat: SeatView }
  | { readonly kind: "back"; readonly seat: SeatView }
  /** A result corrected after the player left. */
  | { readonly kind: "result"; readonly seat: SeatView }
  | { readonly kind: "close" }
  | { readonly kind: "reopen" };

/**
 * What changed between two looks at the table, in the order to show it: people sitting and
 * moving, chips changing, people leaving with their results, then the table closing.
 */
export const tableEvents = (prev: TableView, next: TableView): ReadonlyArray<TableEvent> => {
  const before = new Map(prev.seats.map((s) => [s.playerId, s]));
  const after = new Map(next.seats.map((s) => [s.playerId, s]));
  const events: Array<TableEvent> = [];
  if (prev.closed && !next.closed) events.push({ kind: "reopen" });
  for (const [playerId, was] of before)
    if (!after.has(playerId)) events.push({ kind: "stand", seat: was });
  for (const [playerId, now] of after) {
    const was = before.get(playerId);
    if (!was) events.push({ kind: "sit", seat: now });
    else if (was.seat !== now.seat) events.push({ kind: "move", from: was, to: now });
  }
  for (const [playerId, now] of after) {
    const was = before.get(playerId) ?? { ...now, inPlay: MinorUnits.make(0), out: null };
    if (was.out && !now.out) events.push({ kind: "back", seat: now });
    else if (
      was.out &&
      now.out &&
      (was.out.net !== now.out.net ||
        was.out.cashOut !== now.out.cashOut ||
        was.out.buyIn !== now.out.buyIn)
    )
      events.push({ kind: "result", seat: now });
    else if (!now.out && was.inPlay !== now.inPlay)
      events.push({ kind: "stack", from: { ...was, seat: now.seat }, to: now });
  }
  // Closing settles everyone at once, so the close shot shows every result together.
  if (!prev.closed && next.closed) events.push({ kind: "close" });
  else
    for (const [playerId, now] of after) {
      const was = before.get(playerId);
      if (!now.out || was?.out) continue;
      if (now.out.cashOut === 0) events.push({ kind: "bust", seat: now });
      else
        events.push({
          kind: "cashOut",
          seat: now,
          big: now.out.buyIn > 0 && now.out.cashOut >= now.out.buyIn * BIG_HIT,
        });
    }
  return events;
};

/** The table with one event applied: what's on screen once that event has played. */
export const applyEvent = (view: TableView, event: TableEvent, next: TableView): TableView => {
  const others = (playerId: PlayerId) => view.seats.filter((s) => s.playerId !== playerId);
  const put = (seat: SeatView) => ({
    ...view,
    seats: [...others(seat.playerId), seat].toSorted((a, b) => a.seat - b.seat),
  });
  switch (event.kind) {
    case "sit":
      return put({ ...event.seat, inPlay: MinorUnits.make(0), out: null });
    case "stand":
      return { ...view, seats: others(event.seat.playerId) };
    case "move": {
      const current = view.seats.find((s) => s.playerId === event.from.playerId) ?? event.from;
      return put({ ...current, seat: event.to.seat });
    }
    case "stack":
    case "cashOut":
    case "bust":
    case "back":
    case "result":
      return put(event.kind === "stack" ? event.to : event.seat);
    case "close":
    case "reopen":
      return next;
  }
};

// ---- The camera ----------------------------------------------------------------------------------

/**
 * Where the camera is: a rendered frame `f` (fractional between frames), and a 2D push over it,
 * the table scaled by `z` and offset by `x`, `y` (fractions of the table's size) from the top left.
 */
export interface Camera {
  readonly f: number;
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** A camera looking at `fx`, `fy` at zoom `z`; a push pulls that point toward the middle. */
const look = (f: number, z: number, fx: number, fy: number): Camera => {
  const pull = clamp((z - 1) * 3, 0, 1);
  return { f, z, x: lerp(fx, 0.5, pull) - fx * z, y: lerp(fy, 0.5, pull) - fy * z };
};

export const mixCamera = (a: Camera, b: Camera, t: number): Camera => ({
  f: lerp(a.f, b.f, t),
  z: lerp(a.z, b.z, t),
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** The shots a session moves between. */
export const shots = (art: TableArt) => ({
  /** Low at the rail, stepped back: walking up to an empty table. */
  arrive: look(art.frames.length - 1, 0.86, 0.5, 0.62),
  /** A player's-eye view, where the camera rests while the table is live. */
  home: look(frameAt(art, 46), 1, 0.5, 0.5),
  /** Straight down, once the session closes: everyone's result on the felt. */
  overhead: look(0, 0.97, 0.5, 0.5),
});

/** Where the camera rests for a table: arriving while it's empty, home while live, overhead closed. */
export const restShot = (art: TableArt, view: TableView) => {
  const s = shots(art);
  return view.closed ? s.overhead : view.seats.length === 0 ? s.arrive : s.home;
};

/** How the night is paced. Durations in milliseconds. */
export const pacing = {
  move: 1300,
  push: 1.35,
  hold: 900,
  bounce: 0.42,
};

// ---- Choreography ----------------------------------------------------------------------------------

export type Ease = "inOut" | "out";

/** A motion a platform plays on the chips; each resolves when it's done. */
export type Motion =
  | { readonly kind: "drop"; readonly seat: number }
  | { readonly kind: "lift"; readonly seat: number }
  | { readonly kind: "grow"; readonly seat: number; readonly from: number }
  | { readonly kind: "rack"; readonly seat: number }
  | { readonly kind: "sweep"; readonly seat: number }
  | { readonly kind: "shine" }
  | { readonly kind: "flip"; readonly seats: ReadonlyArray<number> };

export type Beat =
  | { readonly kind: "camera"; readonly to: Camera; readonly ms: number; readonly ease: Ease }
  | { readonly kind: "motion"; readonly motion: Motion; readonly wait: boolean }
  | { readonly kind: "show" }
  | { readonly kind: "hold"; readonly ms: number };

/**
 * How one event plays: where the camera goes, what the chips do, and when the table on screen
 * catches up with it (`show`). Sitting down and buying in leave the camera alone; leaving the
 * table, a big hit and the close each get a shot.
 */
export const beats = (
  art: TableArt,
  event: TableEvent,
  camera: Camera,
  currency: CurrencyCode,
): ReadonlyArray<Beat> => {
  const at = (seat: number, f = camera.f) => anchorsAt(art, f)[seat - 1]!;
  const push = (seat: number, zoom: number, ms: number): Beat => ({
    kind: "camera",
    to: look(camera.f, zoom, at(seat).x, at(seat).y),
    ms,
    ease: "inOut",
  });
  const motion = (m: Motion, wait = true): Beat => ({ kind: "motion", motion: m, wait });
  const show: Beat = { kind: "show" };
  switch (event.kind) {
    case "sit":
      return [show, motion({ kind: "drop", seat: event.seat.seat })];
    case "stand":
      return [motion({ kind: "lift", seat: event.seat.seat }), show];
    case "move":
      return [
        motion({ kind: "lift", seat: event.from.seat }),
        show,
        motion({ kind: "drop", seat: event.to.seat }),
      ];
    case "stack": {
      const from = stackOf(event.from.inPlay, currency);
      const to = stackOf(event.to.inPlay, currency);
      // A rebuy in the same chips lands on the stack; a color-up rebuilds it.
      const kept = from.chip === to.chip && to.count >= from.count ? from.count : 0;
      return [show, motion({ kind: "grow", seat: event.to.seat, from: kept })];
    }
    case "back":
      return [show, motion({ kind: "grow", seat: event.seat.seat, from: 0 })];
    case "result":
      return [show, motion({ kind: "flip", seats: [event.seat.seat] }, false)];
    case "bust":
      return [
        push(event.seat.seat, 1 + (pacing.push - 1) * 0.6, pacing.move * 0.45),
        motion({ kind: "sweep", seat: event.seat.seat }),
        show,
        motion({ kind: "flip", seats: [event.seat.seat] }, false),
        { kind: "hold", ms: pacing.hold * 0.7 },
      ];
    case "cashOut": {
      const seat = event.seat.seat;
      const lead: ReadonlyArray<Beat> = event.big
        ? [
            {
              kind: "camera",
              to: look(
                frameAt(art, 62),
                1.12,
                at(seat, frameAt(art, 62)).x,
                at(seat, frameAt(art, 62)).y,
              ),
              ms: pacing.move * 0.8,
              ease: "inOut",
            },
            motion({ kind: "shine" }, false),
          ]
        : [push(seat, pacing.push, pacing.move * 0.5)];
      return [
        ...lead,
        motion({ kind: "rack", seat }),
        show,
        motion({ kind: "flip", seats: [seat] }, false),
        { kind: "hold", ms: pacing.hold },
      ];
    }
    case "close":
    case "reopen":
      return [show];
  }
};

// ---- Playing it ---------------------------------------------------------------------------------

/** What a platform does for the director: move its camera, play effects, redraw the table. */
export interface Stage {
  readonly camera: () => Camera;
  /** Moves the camera; a newer move stops this one. Resolves when it arrives or is stopped. */
  readonly move: (to: Camera, ms: number, ease: Ease) => Promise<void>;
  readonly play: (effect: Motion) => Promise<void>;
  readonly show: (view: TableView) => void;
  readonly wait: (ms: number) => Promise<void>;
  /** True while a sheet is open over the table: the camera waits for it to close. */
  readonly paused: () => boolean;
  readonly reduced: () => boolean;
}

/**
 * Plays the changes to a table one event at a time, in order. Each new look at the table queues
 * what changed since the last; the screen catches up event by event, then the camera settles on
 * where it rests for the table as it now is.
 */
export const makeDirector = (
  art: TableArt,
  currency: CurrencyCode,
  stage: Stage,
  initial: TableView,
) => {
  let target = initial;
  let shown = initial;
  let running: Promise<void> | null = null;
  // Shared with whatever is playing, which checks it between beats.
  const life = { stopped: false };
  const untilUnpaused = async () => {
    while (stage.paused() && !life.stopped) await stage.wait(200);
  };

  const play = async (event: TableEvent, next: TableView) => {
    const reduced = stage.reduced();
    for (const beat of beats(art, event, stage.camera(), currency)) {
      if (life.stopped) return;
      switch (beat.kind) {
        case "camera":
          await untilUnpaused();
          await stage.move(beat.to, reduced ? 0 : beat.ms, beat.ease);
          break;
        case "motion":
          if (reduced) continue;
          if (beat.wait) await stage.play(beat.motion);
          else void stage.play(beat.motion);
          break;
        case "show":
          shown = applyEvent(shown, event, next);
          stage.show(shown);
          break;
        case "hold":
          if (!reduced) await stage.wait(beat.ms);
          break;
      }
    }
    if (event.kind === "close") {
      await untilUnpaused();
      await stage.move(restShot(art, shown), reduced ? 0 : pacing.move, "inOut");
      if (!reduced) void stage.play({ kind: "flip", seats: shown.seats.map((s) => s.seat) });
    }
  };

  const drain = async () => {
    // Start after whatever called update has finished, such as a render committing.
    await Promise.resolve();
    while (!life.stopped) {
      const events = tableEvents(shown, target);
      if (events.length === 0) break;
      const next = target;
      for (const event of events) {
        if (life.stopped || next !== target) break;
        await play(event, next);
      }
      // Anything this pass skipped shows up as is.
      if (next === target && tableEvents(shown, target).length > 0) {
        shown = target;
        stage.show(shown);
      }
    }
    if (life.stopped) return;
    const rest = restShot(art, shown);
    const now = stage.camera();
    if (now.f !== rest.f || now.z !== rest.z || now.x !== rest.x || now.y !== rest.y) {
      await untilUnpaused();
      await stage.move(rest, stage.reduced() ? 0 : pacing.move * 0.6, "inOut");
    }
  };

  const kick = (): Promise<void> =>
    (running ??= drain().finally(() => {
      running = null;
      if (!life.stopped && tableEvents(shown, target).length > 0) void kick();
    }));

  return {
    /** The table as the data now has it. */
    update: (view: TableView) => {
      target = view;
      return kick();
    },
    stop: () => {
      life.stopped = true;
    },
  };
};

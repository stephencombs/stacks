import { describe, expect, it } from "@effect/vitest";
import { CurrencyCode, MinorUnits, PlayerId } from "@stacks/contracts";
import * as Schema from "effect/Schema";

import {
  anchorsAt,
  applyEvent,
  chipAngles,
  frameAt,
  makeDirector,
  restShot,
  shots,
  stackOf,
  tableEvents,
  tableView,
  type Camera,
  type Motion,
  type SeatView,
  type TableEvent,
  type TableView,
} from "./table.ts";
import { blackjackArt as art } from "./tableArt.ts";

const usd = CurrencyCode.make("USD");
const jpy = CurrencyCode.make("JPY");
const player = (n: number) => PlayerId.make(`0192e7a0-0000-7000-8000-00000000000${n}`);
const [STEPHEN, BRUCE, NICK, BRAD] = [player(1), player(2), player(3), player(4)];

const money = MinorUnits.make;
const seat = (
  playerId: PlayerId,
  n: number,
  inPlay = 0,
  out: { net: number; cashOut: number; buyIn: number } | null = null,
): SeatView => ({
  seat: n,
  playerId,
  inPlay: money(inPlay),
  out: out && { net: money(out.net), cashOut: money(out.cashOut), buyIn: money(out.buyIn) },
});
const table = (seats: ReadonlyArray<SeatView>, closed = false): TableView => ({ closed, seats });
const kinds = (events: ReadonlyArray<TableEvent>) => events.map((e) => e.kind);

describe("tableView", () => {
  it("shows what each seated player has in play, or their result once they're out", () => {
    const view = tableView({
      closed: false,
      seats: new Map([
        [BRUCE, 4],
        [STEPHEN, 7],
      ]),
      results: new Map([
        [STEPHEN, { buyIn: money(30000), cashOut: money(0), net: money(-30000) }],
        [BRUCE, { buyIn: money(50000), cashOut: money(120000), net: money(70000) }],
      ]),
      cashedOut: new Set([BRUCE]),
    });
    expect(view.seats).toEqual([
      seat(BRUCE, 4, 0, { net: 70000, cashOut: 120000, buyIn: 50000 }),
      seat(STEPHEN, 7, 30000),
    ]);
  });
});

describe("tableEvents", () => {
  it("is quiet when nothing changed", () => {
    const view = table([seat(STEPHEN, 7, 30000)]);
    expect(tableEvents(view, view)).toEqual([]);
  });

  it("puts people in their seats before their chips", () => {
    const events = tableEvents(table([]), table([seat(STEPHEN, 7, 30000), seat(BRUCE, 4)]));
    expect(kinds(events)).toEqual(["sit", "sit", "stack"]);
  });

  it("tells a move from someone standing up", () => {
    const events = tableEvents(
      table([seat(STEPHEN, 7), seat(BRUCE, 4)]),
      table([seat(STEPHEN, 6)]),
    );
    expect(events).toEqual([
      { kind: "stand", seat: seat(BRUCE, 4) },
      { kind: "move", from: seat(STEPHEN, 7), to: seat(STEPHEN, 6) },
    ]);
  });

  it("calls a zero cash-out a bust and three times the buy-in a big hit", () => {
    const playing = table([seat(STEPHEN, 7, 30000), seat(NICK, 1, 20000), seat(BRAD, 5, 20000)]);
    const after = table([
      seat(STEPHEN, 7, 0, { net: 80000, cashOut: 110000, buyIn: 30000 }),
      seat(NICK, 1, 0, { net: -20000, cashOut: 0, buyIn: 20000 }),
      seat(BRAD, 5, 0, { net: 6000, cashOut: 26000, buyIn: 20000 }),
    ]);
    expect(
      tableEvents(playing, after).map((e) =>
        e.kind === "cashOut" ? `${e.seat.seat}:${e.big}` : e.kind,
      ),
    ).toEqual(["7:true", "bust", "5:false"]);
  });

  it("settles everyone in one close shot", () => {
    const events = tableEvents(
      table([seat(STEPHEN, 7, 30000)]),
      table([seat(STEPHEN, 7, 0, { net: 0, cashOut: 30000, buyIn: 30000 })], true),
    );
    expect(kinds(events)).toEqual(["close"]);
  });

  it("brings chips back when a cash-out is voided", () => {
    const out = table([seat(BRAD, 5, 0, { net: 6000, cashOut: 26000, buyIn: 20000 })]);
    expect(kinds(tableEvents(out, table([seat(BRAD, 5, 20000)])))).toEqual(["back"]);
  });

  const Player = Schema.Literals([0, 1, 2, 3]);
  const Seat = Schema.Struct({
    player: Player,
    seat: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 })),
    inPlay: Schema.Literals([0, 20000, 50000]),
    out: Schema.Literals(["playing", "bust", "up"]),
  });
  const View = Schema.Struct({ closed: Schema.Boolean, seats: Schema.Array(Seat) });
  const build = (v: typeof View.Type): TableView => {
    const taken = new Set<number>();
    const players = new Set<number>();
    const seats: Array<SeatView> = [];
    for (const s of v.seats) {
      if (taken.has(s.seat) || players.has(s.player)) continue;
      taken.add(s.seat);
      players.add(s.player);
      const playerId = [STEPHEN, BRUCE, NICK, BRAD][s.player]!;
      const out =
        v.closed || s.out !== "playing"
          ? {
              net: s.out === "up" ? 1000 : -s.inPlay,
              cashOut: s.out === "up" ? s.inPlay + 1000 : 0,
              buyIn: s.inPlay,
            }
          : null;
      seats.push(seat(playerId, s.seat, out ? 0 : s.inPlay, out));
    }
    return table(
      seats.toSorted((a, b) => a.seat - b.seat),
      v.closed,
    );
  };

  it.prop("plays every change between two tables, ending on the second", [View, View], ([a, b]) => {
    const [prev, next] = [build(a), build(b)];
    let shown = prev;
    for (const event of tableEvents(prev, next)) shown = applyEvent(shown, event, next);
    expect(shown).toEqual(next);
  });
});

describe("stackOf", () => {
  it("colors up to the biggest chip that still makes a stack of three", () => {
    expect(stackOf(30000, usd)).toEqual({ chip: 4, count: 3 });
    expect(stackOf(150000, usd)).toEqual({ chip: 5, count: 3 });
    expect(stackOf(100000, usd)).toEqual({ chip: 4, count: 10 });
    expect(stackOf(20000, usd)).toEqual({ chip: 3, count: 8 });
  });

  it("caps a stack at ten chips and shows nothing for nothing", () => {
    expect(stackOf(9_000_000, usd)).toEqual({ chip: 8, count: 10 });
    expect(stackOf(0, usd)).toEqual({ chip: 0, count: 0 });
    expect(stackOf(100, usd)).toEqual({ chip: 1, count: 1 });
  });

  it("counts whole units in the table's currency", () => {
    expect(stackOf(300, jpy)).toEqual({ chip: 4, count: 3 });
  });
});

describe("the art", () => {
  it("runs from overhead down to the rail", () => {
    expect(art.elevations[0]).toBeGreaterThan(art.elevations.at(-1)!);
    expect(frameAt(art, 90)).toBe(0);
    expect(frameAt(art, 0)).toBe(art.frames.length - 1);
  });

  it("moves seats smoothly between rendered frames", () => {
    const [a, b] = [anchorsAt(art, 18)[3]!, anchorsAt(art, 19)[3]!];
    const mid = anchorsAt(art, 18.5)[3]!;
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
    expect(mid.e).toBeCloseTo((a.e + b.e) / 2, 6);
  });

  it("finds the chip angles either side of a seat's", () => {
    expect(chipAngles(art, 45)).toEqual({ low: 42, high: 48, t: 0.5 });
    expect(chipAngles(art, 10).low).toBe(art.chipLevels[0]);
    expect(chipAngles(art, 99).t).toBe(1);
  });

  it("rests arriving, home or overhead with the table", () => {
    const s = shots(art);
    expect(restShot(art, table([]))).toEqual(s.arrive);
    expect(restShot(art, table([seat(STEPHEN, 7)]))).toEqual(s.home);
    expect(restShot(art, table([seat(STEPHEN, 7)], true))).toEqual(s.overhead);
    expect(s.overhead.f).toBe(0);
  });
});

describe("makeDirector", () => {
  const stage = (start: Camera) => {
    let camera = start;
    const log: Array<string> = [];
    let paused = false;
    return {
      log,
      pause: (p: boolean) => (paused = p),
      stage: {
        camera: () => camera,
        move: async (to: Camera) => {
          log.push(`camera ${to.f.toFixed(0)}@${to.z.toFixed(2)}`);
          camera = to;
        },
        play: async (effect: Motion) => void log.push(`effect ${effect.kind}`),
        show: (view: TableView) =>
          void log.push(`show ${view.seats.map((s) => `${s.seat}${s.out ? "x" : ""}`).join(",")}`),
        wait: async () => {
          paused = false;
        },
        paused: () => paused,
        reduced: () => false,
      },
    };
  };

  it("plays a night's changes in order and comes to rest", async () => {
    const empty = table([]);
    const s = stage(restShot(art, empty));
    const director = makeDirector(art, usd, s.stage, empty);
    await director.update(table([seat(STEPHEN, 7, 30000)]));
    await director.update(
      table([seat(STEPHEN, 7, 0, { net: 80000, cashOut: 110000, buyIn: 30000 })], true),
    );
    expect(s.log).toEqual([
      "show 7",
      "effect drop",
      "show 7",
      "effect grow",
      "camera 18@1.00",
      "show 7x",
      "camera 0@0.97",
      "effect flip",
    ]);
  });

  it("pushes in on a cash-out and lifts the crane for a big hit", async () => {
    const playing = table([seat(BRAD, 5, 20000), seat(STEPHEN, 7, 30000)]);
    const s = stage(shots(art).home);
    const director = makeDirector(art, usd, s.stage, playing);
    await director.update(
      table([
        seat(BRAD, 5, 0, { net: 6000, cashOut: 26000, buyIn: 20000 }),
        seat(STEPHEN, 7, 0, { net: 80000, cashOut: 110000, buyIn: 30000 }),
      ]),
    );
    expect(s.log.filter((l) => l.startsWith("camera"))).toEqual([
      "camera 18@1.35",
      "camera 10@1.12",
      "camera 18@1.00",
    ]);
    expect(s.log.filter((l) => l.startsWith("effect"))).toEqual([
      "effect rack",
      "effect flip",
      "effect shine",
      "effect rack",
      "effect flip",
    ]);
  });

  it("holds the camera while a sheet is open", async () => {
    const playing = table([seat(NICK, 1, 20000)]);
    const s = stage(shots(art).home);
    s.pause(true);
    const director = makeDirector(art, usd, s.stage, playing);
    await director.update(table([seat(NICK, 1, 0, { net: -20000, cashOut: 0, buyIn: 20000 })]));
    // The first wait stands in for the sheet closing; only then does the push happen.
    expect(s.log[0]).toBe("camera 18@1.21");
  });
});

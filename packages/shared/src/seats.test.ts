import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { SessionId } from "@stacks/contracts";

import { mainSeats, resultsBySeat, seatsNow } from "./seats.ts";
import { ALEX, BEA, CAL, entry, money } from "./testing/ledgerArbitrary.ts";

const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 22, 21, minute));
const sit = (playerId: typeof ALEX, seat: number | null, minute: number) => ({
  playerId,
  seat,
  occurredAt: at(minute),
});

describe("seatsNow", () => {
  it("follows each player's latest sit, move or stand", () => {
    const now = seatsNow([
      sit(ALEX, 7, 0),
      sit(BEA, 4, 1),
      sit(CAL, 1, 2),
      sit(ALEX, 6, 30),
      sit(CAL, null, 40),
    ]);
    expect([...now]).toEqual([
      [ALEX, 6],
      [BEA, 4],
    ]);
  });

  it("is empty before anyone sits", () => {
    expect(seatsNow([]).size).toBe(0);
  });
});

describe("mainSeats", () => {
  it("credits the seat held longest, not the latest", () => {
    const main = mainSeats([sit(ALEX, 7, 0), sit(ALEX, 3, 50)], at(59));
    expect(main.get(ALEX)).toBe(7);
  });

  it("doesn't count time spent standing", () => {
    const main = mainSeats([sit(BEA, 2, 0), sit(BEA, null, 10), sit(BEA, 5, 40)], at(59));
    expect(main.get(BEA)).toBe(5);
  });

  it("adds up separate spells in the same seat", () => {
    const main = mainSeats(
      [sit(CAL, 1, 0), sit(CAL, 2, 10), sit(CAL, 1, 30), sit(CAL, 2, 35)],
      at(45),
    );
    // Seat 1: 10 + 5 minutes. Seat 2: 20 + 10 minutes.
    expect(main.get(CAL)).toBe(2);
  });

  it("gives a tie to the seat taken first", () => {
    expect(mainSeats([sit(ALEX, 4, 0), sit(ALEX, 6, 10)], at(20)).get(ALEX)).toBe(4);
  });

  it("still names a seat taken as the session ended", () => {
    expect(mainSeats([sit(BEA, 3, 30)], at(30)).get(BEA)).toBe(3);
  });

  it("leaves out anyone who never sat", () => {
    expect(mainSeats([sit(ALEX, null, 0)], at(30)).has(ALEX)).toBe(false);
  });

  const Moves = Schema.Array(
    Schema.Struct({
      player: Schema.Literals([0, 1, 2]),
      seat: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 }))),
      gap: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 30 })),
    }),
  );

  it.prop("always credits a seat the player actually sat in", [Moves], ([moves]) => {
    let minute = 0;
    const seatings = moves.map((m) => {
      minute += m.gap;
      return {
        playerId: [ALEX, BEA, CAL][m.player]!,
        seat: m.seat,
        occurredAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 22, 12) + minute * 60_000),
      };
    });
    const main = mainSeats(seatings, DateTime.makeUnsafe(Date.UTC(2026, 9, 23)));
    for (const [playerId, seat] of main)
      expect(seatings.some((s) => s.playerId === playerId && s.seat === seat)).toBe(true);
    for (const s of seatings) if (s.seat !== null) expect(main.has(s.playerId)).toBe(true);
  });
});

describe("resultsBySeat", () => {
  const S1 = SessionId.make("0192e7a0-0000-7000-8000-000000000601");
  const S2 = SessionId.make("0192e7a0-0000-7000-8000-000000000602");
  const S3 = SessionId.make("0192e7a0-0000-7000-8000-000000000603");
  const sessions = [
    { id: S1, endedAt: at(59) },
    { id: S2, endedAt: at(59) },
    { id: S3, endedAt: at(59) },
  ];
  const inSession = (sessionId: SessionId, rows: ReadonlyArray<ReturnType<typeof sit>>) =>
    rows.map((row) => ({ ...row, sessionId }));
  const play = (sessionId: SessionId, playerId: typeof ALEX, buyIn: number, cashOut: number) => [
    { ...entry({ kind: "buy_in", playerId, amount: money(buyIn) }), sessionId },
    { ...entry({ kind: "cash_out", playerId, amount: money(cashOut) }), sessionId },
  ];

  it("credits each session's result to the seat held longest there", () => {
    const bySeat = resultsBySeat(
      sessions,
      [
        ...inSession(S1, [sit(ALEX, 7, 0), sit(BEA, 1, 0), sit(ALEX, 2, 55)]),
        ...inSession(S2, [sit(ALEX, 7, 0)]),
      ],
      [...play(S1, ALEX, 300, 1100), ...play(S1, BEA, 200, 0), ...play(S2, ALEX, 500, 200)],
    );
    expect(bySeat.get(7)?.sessions).toBe(2);
    expect(bySeat.get(7)?.results.get(ALEX)?.net).toBe(500);
    expect(bySeat.get(1)?.results.get(BEA)?.net).toBe(-200);
    expect(bySeat.has(2)).toBe(false);
  });

  it("leaves out play nobody was seated for", () => {
    const bySeat = resultsBySeat(sessions, [], play(S3, CAL, 100, 300));
    expect(bySeat.size).toBe(0);
  });
});

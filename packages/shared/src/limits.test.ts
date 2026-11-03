import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CurrencyCode, SessionId, type UserLimits } from "@stacks/contracts";

import {
  SESSION_REMINDER_OPTIONS,
  editableLimitAmount,
  evaluateLimits,
  exampleLimitAmount,
  formatPlayedMinutes,
  lossLimitNotice,
  sessionReminderNotice,
  tripPlayerNet,
  type LimitSessionInput,
} from "./limits.ts";
import { parseMoney } from "./money.ts";
import { playerResults } from "./results.ts";
import { ALEX, BEA, entry, money } from "./testing/ledgerArbitrary.ts";

const USD = CurrencyCode.make("USD");
const JPY = CurrencyCode.make("JPY");
const KWD = CurrencyCode.make("KWD");
const EUR = CurrencyCode.make("EUR");

const S1 = SessionId.make("0192e7a0-0000-7000-8000-0000000000a1");
const S2 = SessionId.make("0192e7a0-0000-7000-8000-0000000000a2");
const S3 = SessionId.make("0192e7a0-0000-7000-8000-0000000000a3");

const at = (iso: string) => DateTime.makeUnsafe(iso);

describe("lossLimitNotice", () => {
  it("stays silent when unset, up, even, or below 80%", () => {
    expect(lossLimitNotice(money(-50000), null)).toBeNull();
    expect(lossLimitNotice(money(0), money(50000))).toBeNull();
    expect(lossLimitNotice(money(15000), money(50000))).toBeNull();
    expect(lossLimitNotice(money(-39999), money(50000))).toBeNull();
  });

  it("triggers approaching at 80% through 99% with exact integer math", () => {
    expect(lossLimitNotice(money(-40000), money(50000))).toEqual({
      level: "approaching",
      loss: 40000,
      limit: 50000,
      percent: 80,
      remaining: 10000,
      over: 0,
    });
    expect(lossLimitNotice(money(-49999), money(50000))).toEqual({
      level: "approaching",
      loss: 49999,
      limit: 50000,
      percent: 99,
      remaining: 1,
      over: 0,
    });
    expect(lossLimitNotice(money(-80), money(101))).toBeNull();
    expect(lossLimitNotice(money(-81), money(101))).toMatchObject({
      level: "approaching",
      percent: 80,
      remaining: 20,
      over: 0,
    });
  });

  it("triggers reached at 100% and above", () => {
    expect(lossLimitNotice(money(-50000), money(50000))).toEqual({
      level: "reached",
      loss: 50000,
      limit: 50000,
      percent: 100,
      remaining: 0,
      over: 0,
    });
    expect(lossLimitNotice(money(-62500), money(50000))).toEqual({
      level: "reached",
      loss: 62500,
      limit: 50000,
      percent: 125,
      remaining: 0,
      over: 12500,
    });
  });

  it("handles large safe-integer amounts without overflow", () => {
    const hugeLimit = money(4_000_000_000_000_000);
    expect(lossLimitNotice(money(-3_199_999_999_999_999), hugeLimit)).toBeNull();
    expect(lossLimitNotice(money(-3_200_000_000_000_000), hugeLimit)).toMatchObject({
      level: "approaching",
      percent: 80,
    });
    expect(lossLimitNotice(money(-4_000_000_000_000_000), hugeLimit)).toMatchObject({
      level: "reached",
      percent: 100,
    });
  });

  it.prop(
    "preserves exact threshold and conservation invariants across arbitrary nets and limits",
    [
      Schema.Int.check(Schema.isBetween({ minimum: -5_000_000, maximum: 5_000_000 })),
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5_000_000 })),
    ],
    ([rawNet, rawLimit]) => {
      const net = money(rawNet);
      const limit = money(rawLimit);
      const notice = lossLimitNotice(net, limit);
      const loss = rawNet < 0 ? -rawNet : 0;

      if (BigInt(loss) * 5n < BigInt(rawLimit) * 4n) {
        expect(notice).toBeNull();
        return;
      }

      expect(notice).not.toBeNull();
      expect(notice!.loss).toBe(loss);
      expect(notice!.limit).toBe(rawLimit);
      expect(notice!.loss + notice!.remaining - notice!.over).toBe(rawLimit);
      expect(notice!.remaining === 0 || notice!.over === 0).toBe(true);
      if (loss >= rawLimit) {
        expect(notice!.level).toBe("reached");
        expect(notice!.percent).toBeGreaterThanOrEqual(100);
        expect(notice!.remaining).toBe(0);
        expect(notice!.over).toBe(loss - rawLimit);
      } else {
        expect(notice!.level).toBe("approaching");
        expect(notice!.percent).toBeGreaterThanOrEqual(80);
        expect(notice!.percent).toBeLessThan(100);
        expect(notice!.remaining).toBe(rawLimit - loss);
        expect(notice!.over).toBe(0);
      }

      const deeper = lossLimitNotice(money(rawNet - 1), limit);
      expect(deeper).not.toBeNull();
      expect(deeper!.percent).toBeGreaterThanOrEqual(notice!.percent);
    },
  );
});

describe("tripPlayerNet", () => {
  it("combines closed results with un-cashed-out live session exposure and local overrides", () => {
    const liveEntries = [
      entry({ kind: "buy_in", playerId: ALEX, amount: money(30000) }),
      entry({ kind: "buy_in", playerId: BEA, amount: money(50000) }),
    ];
    const liveResults = Array.from(playerResults(liveEntries), ([playerId, r]) => ({
      playerId,
      net: r.net,
    }));

    const sessions = [
      {
        session: { id: S1 },
        results: [
          { playerId: ALEX, net: money(-15000) },
          { playerId: BEA, net: money(20000) },
        ],
      },
      {
        session: { id: S2 },
        results: liveResults,
      },
    ];

    expect(tripPlayerNet(sessions, ALEX)).toBe(-45000);
    expect(tripPlayerNet(sessions, BEA)).toBe(-30000);
    expect(tripPlayerNet(sessions, ALEX, { sessionId: S2, net: money(-40000) })).toBe(-55000);
    expect(tripPlayerNet(sessions, ALEX, { sessionId: S3, net: money(-10000) })).toBe(-55000);
  });

  it.prop(
    "matches the sum of player nets across sessions and swaps local overrides without double-counting",
    [
      Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: -100_000, maximum: 100_000 }))),
      Schema.Int.check(Schema.isBetween({ minimum: -100_000, maximum: 100_000 })),
    ],
    ([sessionNets, overrideNet]) => {
      const sessions = sessionNets.map((net, index) => ({
        session: {
          id: SessionId.make(`0192e7a0-0000-7000-8000-${String(index + 1).padStart(12, "0")}`),
        },
        results: [
          { playerId: ALEX, net: money(net) },
          { playerId: BEA, net: money(-net) },
        ],
      }));

      const expected = sessionNets.reduce((sum, n) => sum + n, 0);
      expect(tripPlayerNet(sessions, ALEX)).toBe(expected);

      if (sessions.length > 0) {
        const firstId = sessions[0]!.session.id;
        const swapped = expected - sessionNets[0]! + overrideNet;
        expect(tripPlayerNet(sessions, ALEX, { sessionId: firstId, net: money(overrideNet) })).toBe(
          swapped,
        );
      }
    },
  );
});

describe("sessionReminderNotice", () => {
  const start = at("2026-11-02T20:00:00Z");

  it("stays silent when off or before the chosen duration", () => {
    expect(SESSION_REMINDER_OPTIONS).toEqual([120, 180, 240]);
    expect(sessionReminderNotice(start, at("2026-11-03T01:00:00Z"), null)).toBeNull();
    expect(sessionReminderNotice(start, at("2026-11-02T21:59:59.999Z"), 120)).toBeNull();
  });

  it("fires once elapsed time reaches the reminder duration", () => {
    expect(sessionReminderNotice(start, at("2026-11-02T22:00:00Z"), 120)).toEqual({
      minutesPlayed: 120,
      reminderMinutes: 120,
    });
    expect(sessionReminderNotice(start, at("2026-11-02T22:17:45Z"), 120)).toEqual({
      minutesPlayed: 137,
      reminderMinutes: 120,
    });
  });

  it("measures elapsed time across timezone offsets and daylight saving changes", () => {
    expect(
      sessionReminderNotice(at("2026-11-01T00:30:00-04:00"), at("2026-11-01T01:30:00-05:00"), 120),
    ).toEqual({ minutesPlayed: 120, reminderMinutes: 120 });
  });

  it.prop(
    "is monotonic in elapsed time",
    [
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1440 })),
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200_000_000 })),
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 60_000_000 })),
    ],
    ([reminderMinutes, elapsedMs, deltaMs]) => {
      const startMs = DateTime.toEpochMillis(start);
      const t1 = DateTime.makeUnsafe(startMs + elapsedMs);
      const t2 = DateTime.makeUnsafe(startMs + elapsedMs + deltaMs);
      const r1 = sessionReminderNotice(start, t1, reminderMinutes);
      const r2 = sessionReminderNotice(start, t2, reminderMinutes);

      if (elapsedMs < reminderMinutes * 60_000) {
        expect(r1).toBeNull();
      } else {
        expect(r1).toEqual({
          minutesPlayed: Math.floor(elapsedMs / 60_000),
          reminderMinutes,
        });
        expect(r2).not.toBeNull();
        expect(r2!.minutesPlayed).toBeGreaterThanOrEqual(r1!.minutesPlayed);
      }
    },
  );
});

describe("evaluateLimits", () => {
  const limits: UserLimits = {
    lossLimit: money(50000),
    currency: USD,
    sessionReminderMinutes: 120,
  };

  const baseSessions: ReadonlyArray<LimitSessionInput> = [
    {
      session: { id: S1, status: "closed", startedAt: at("2026-11-02T17:00:00Z") },
      playing: [],
      results: [{ playerId: ALEX, net: money(-25000) }],
    },
    {
      session: { id: S2, status: "live", startedAt: at("2026-11-02T20:00:00Z") },
      myJoinedAt: at("2026-11-02T20:00:00Z"),
      playing: [ALEX],
      results: [{ playerId: ALEX, net: money(-20000) }],
    },
  ];

  it("starts the reminder when the player joined, not when the session started", () => {
    const sessions = baseSessions.map((session) => ({
      ...session,
      myJoinedAt: session.session.id === S2 ? at("2026-11-02T21:30:00Z") : null,
    }));
    expect(
      evaluateLimits({
        limits,
        currency: USD,
        playerId: ALEX,
        sessions,
        now: at("2026-11-02T22:15:00Z"),
      }).sessionReminder,
    ).toBeNull();
    expect(
      evaluateLimits({
        limits,
        currency: USD,
        playerId: ALEX,
        sessions,
        now: at("2026-11-02T23:30:00Z"),
      }).sessionReminder,
    ).toEqual({ minutesPlayed: 120, reminderMinutes: 120 });
    expect(
      evaluateLimits({
        limits,
        currency: USD,
        playerId: ALEX,
        sessions: sessions.map((session) => ({ ...session, myJoinedAt: null })),
        now: at("2026-11-03T02:00:00Z"),
      }).sessionReminder,
    ).toBeNull();
    expect(
      evaluateLimits({
        limits,
        currency: USD,
        playerId: BEA,
        sessions,
        now: at("2026-11-03T02:00:00Z"),
      }).sessionReminder,
    ).toBeNull();
    expect(
      evaluateLimits({
        limits,
        currency: USD,
        playerId: ALEX,
        sessions,
        now: at("2026-11-02T22:15:00Z"),
        local: {
          sessionId: S2,
          status: "live",
          playing: true,
          myJoinedAt: at("2026-11-02T21:30:00Z"),
          net: money(-20000),
        },
      }).sessionReminder,
    ).toBeNull();
  });

  it("evaluates both trip loss progress and live session reminder for the seated player", () => {
    const out = evaluateLimits({
      limits,
      currency: USD,
      playerId: ALEX,
      sessions: baseSessions,
      now: at("2026-11-02T22:15:00Z"),
    });

    expect(out.net).toBe(-45000);
    expect(out.lossLimit).toMatchObject({ level: "approaching", percent: 90 });
    expect(out.sessionReminder).toEqual({ minutesPlayed: 135, reminderMinutes: 120 });
  });

  it("skips loss limit on currency mismatch and stops session reminder once cashed out", () => {
    const mismatch = evaluateLimits({
      limits,
      currency: JPY,
      playerId: ALEX,
      sessions: baseSessions,
      now: at("2026-11-02T22:15:00Z"),
    });
    expect(mismatch.lossLimit).toBeNull();
    expect(mismatch.sessionReminder).toEqual({ minutesPlayed: 135, reminderMinutes: 120 });

    const cashedOut = evaluateLimits({
      limits,
      currency: USD,
      playerId: ALEX,
      sessions: baseSessions,
      now: at("2026-11-02T22:15:00Z"),
      local: {
        sessionId: S2,
        status: "live",
        myJoinedAt: at("2026-11-02T20:00:00Z"),
        playing: false,
        net: money(-30000),
      },
    });
    expect(cashedOut.net).toBe(-55000);
    expect(cashedOut.lossLimit).toMatchObject({ level: "reached", over: 5000 });
    expect(cashedOut.sessionReminder).toBeNull();
  });
});

describe("formatting helpers", () => {
  it("formats played minutes and currency examples cleanly", () => {
    expect(formatPlayedMinutes(45)).toBe("45m");
    expect(formatPlayedMinutes(120)).toBe("2h");
    expect(formatPlayedMinutes(125)).toBe("2h 5m");
    expect(exampleLimitAmount(USD)).toBe(50000);
    expect(exampleLimitAmount(JPY)).toBe(50000);
    expect(exampleLimitAmount(KWD)).toBe(500000);
    expect(editableLimitAmount(money(50000), USD, "en-US")).toBe("500");
    expect(editableLimitAmount(money(50050), USD, "en-US")).toBe("500.50");
    expect(editableLimitAmount(money(50050), EUR, "de-DE")).toBe("500,50");
  });

  it.prop(
    "round-trips editableLimitAmount through parseMoney across 0, 2, and 3 decimal currencies",
    [
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000_000 })),
      Schema.Literals(["USD", "EUR", "JPY", "KWD"]),
      Schema.Literals(["en-US", "de-DE"]),
    ],
    ([raw, code, locale]) => {
      const currency = CurrencyCode.make(code);
      const amount = money(raw);
      const text = editableLimitAmount(amount, currency, locale);
      expect(Option.getOrNull(parseMoney(text, currency, { locale }))).toBe(amount);
    },
  );
});

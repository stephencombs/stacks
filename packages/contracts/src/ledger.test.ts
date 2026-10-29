import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { Entry, Session } from "./ledger.ts";

const ALEX = "0192e7a0-0000-7000-8000-000000000001";
const BEA = "0192e7a0-0000-7000-8000-000000000002";
const SESSION = "0192e7a0-0000-7000-8000-0000000000a1";
const TRIP = "0192e7a0-0000-7000-8000-0000000000b1";

const encodedEntry = (fields: Record<string, unknown>) => ({
  id: "0192e7a0-0000-7000-8000-0000000000e1",
  groupId: "0192e7a0-0000-7000-8000-0000000000f1",
  sessionId: SESSION,
  tripId: null,
  kind: "buy_in",
  playerId: ALEX,
  counterpartyId: null,
  amount: 10000,
  occurredAt: "2026-10-27T20:00:00.000Z",
  note: null,
  createdBy: "user_2abc",
  createdAt: "2026-10-27T20:00:00.000Z",
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  replacesEntryId: null,
  ...fields,
});

const decodeEntry = Schema.decodeUnknownExit(Schema.toCodecJson(Entry));
const accepts = (fields: Record<string, unknown>) =>
  Exit.isSuccess(decodeEntry(encodedEntry(fields)));

describe("Entry", () => {
  it("accepts each kind in its valid shape", () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ kind: "buy_in", counterpartyId: BEA })).toBe(true);
    expect(accepts({ kind: "cash_out", amount: 1 })).toBe(true);
    expect(accepts({ kind: "adjustment", amount: -250 })).toBe(true);
    expect(
      accepts({ kind: "settlement", sessionId: null, tripId: TRIP, counterpartyId: BEA }),
    ).toBe(true);
  });

  it("rejects amounts that aren't whole minor units", () => {
    expect(accepts({ amount: 10.5 })).toBe(false);
    expect(accepts({ amount: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });

  it("records a bust as a zero cash-out", () => {
    expect(accepts({ kind: "cash_out", amount: 0 })).toBe(true);
  });

  it("requires positive amounts except on adjustments, which can't be zero", () => {
    expect(accepts({ kind: "buy_in", amount: 0 })).toBe(false);
    expect(accepts({ kind: "cash_out", amount: -5 })).toBe(false);
    expect(accepts({ kind: "adjustment", amount: 0 })).toBe(false);
    expect(
      accepts({
        kind: "settlement",
        sessionId: null,
        tripId: TRIP,
        counterpartyId: BEA,
        amount: -5,
      }),
    ).toBe(false);
  });

  it("keeps the player's own money as an empty counterparty", () => {
    expect(accepts({ kind: "buy_in", counterpartyId: ALEX })).toBe(false);
    expect(accepts({ kind: "cash_out", counterpartyId: ALEX })).toBe(false);
  });

  it("keeps adjustments between the player and the table", () => {
    expect(accepts({ kind: "adjustment", amount: 100, counterpartyId: BEA })).toBe(false);
  });

  it("requires a session for table entries and none for settlements", () => {
    expect(accepts({ kind: "buy_in", sessionId: null })).toBe(false);
    expect(accepts({ kind: "settlement", counterpartyId: BEA })).toBe(false);
  });

  it("puts a settlement on a trip, and a table entry on its session's trip instead", () => {
    expect(accepts({ kind: "settlement", sessionId: null, counterpartyId: BEA })).toBe(false);
    expect(accepts({ kind: "buy_in", tripId: TRIP })).toBe(false);
  });

  it("requires a settlement to be paid to someone else", () => {
    expect(accepts({ kind: "settlement", sessionId: null })).toBe(false);
    expect(
      accepts({ kind: "settlement", sessionId: null, tripId: TRIP, counterpartyId: ALEX }),
    ).toBe(false);
  });
});

describe("Session", () => {
  const decodeSession = Schema.decodeUnknownExit(Schema.toCodecJson(Session));
  const session = (fields: Record<string, unknown>) => ({
    id: SESSION,
    groupId: "0192e7a0-0000-7000-8000-0000000000f1",
    tripId: TRIP,
    venueId: "0192e7a0-0000-7000-8000-0000000000d1",
    game: "blackjack",
    status: "live",
    startedAt: "2026-10-27T20:00:00.000Z",
    endedAt: null,
    notes: null,
    ...fields,
  });

  it("has an end time exactly when it's closed", () => {
    expect(Exit.isSuccess(decodeSession(session({})))).toBe(true);
    const ended = { status: "closed", endedAt: "2026-10-28T01:00:00.000Z" };
    expect(Exit.isSuccess(decodeSession(session(ended)))).toBe(true);
    expect(Exit.isSuccess(decodeSession(session({ status: "closed" })))).toBe(false);
    expect(Exit.isSuccess(decodeSession(session({ endedAt: "2026-10-28T01:00:00.000Z" })))).toBe(
      false,
    );
  });
});

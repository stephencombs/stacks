import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { Actor, PlayerIdentity } from "./players.ts";
import { PlayEntry, Table, Visit, VisitRecording, VisitSummary } from "./recording.ts";
import { ActorId, TableId, VisitId } from "./ids.ts";

const ALEX = "0192e7a0-0000-7000-8000-000000000001";
const BEA = "0192e7a0-0000-7000-8000-000000000002";
const TABLE = "0192e7a0-0000-7000-8000-0000000000a1";
const VISIT = "0192e7a0-0000-7000-8000-0000000000b1";
const ACTOR = "0192e7a0-0000-7000-8000-0000000000c1";
const AT = "2026-11-06T20:00:00.000Z";
const LATER = "2026-11-06T21:00:00.000Z";
const audit = {
  createdBy: ACTOR,
  createdAt: AT,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  replacesEntryId: null,
};
const entry = {
  id: "0192e7a0-0000-7000-8000-0000000000e1",
  visitId: VISIT,
  kind: "buy_in",
  counterpartyId: null,
  amount: 20000,
  currency: "USD",
  occurredAt: AT,
  note: null,
  ...audit,
};
const visit = {
  id: VISIT,
  tableId: TABLE,
  playerId: ALEX,
  startedAt: AT,
  finishedAt: null,
  revision: 0,
};
const accepts = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  value: unknown,
) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(schema))(value));

describe("native recording contracts", () => {
  it("keeps public players independent and represents a guest actor without a fake account", () => {
    expect(accepts(PlayerIdentity, { id: ALEX, displayName: "Alex" })).toBe(true);
    expect(accepts(Actor, { id: ACTOR, userId: null })).toBe(true);
    expect(accepts(Actor, { id: ACTOR, userId: "user_alex" })).toBe(true);
    expect(accepts(Actor, { id: "user_guest", userId: null })).toBe(false);
    expect(accepts(PlayerIdentity, { id: ALEX, displayName: "" })).toBe(false);
    const decode = Schema.decodeUnknownSync(PlayerIdentity);
    expect(decode({ id: ALEX, displayName: "Alex", role: "owner", claimCode: "secret" })).toEqual({
      id: ALEX,
      displayName: "Alex",
    });
  });

  it("accepts existing UUID versions for each distinct native ID", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    for (const id of [ActorId, TableId, VisitId]) expect(accepts(id, uuid)).toBe(true);
  });

  it("allows a table without a collection, game or venue", () => {
    expect(
      accepts(Table, {
        id: TABLE,
        tripId: null,
        game: null,
        venueId: null,
        highLimit: false,
        starterPlayerId: ALEX,
      }),
    ).toBe(true);
  });

  it("requires explicit valid visit lifecycle and revision", () => {
    expect(accepts(Visit, visit)).toBe(true);
    expect(accepts(Visit, { ...visit, finishedAt: LATER, revision: 1 })).toBe(true);
    expect(accepts(Visit, { ...visit, finishedAt: undefined })).toBe(false);
    expect(accepts(Visit, { ...visit, finishedAt: "2026-11-05T20:00:00.000Z" })).toBe(false);
    for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(accepts(Visit, { ...visit, revision })).toBe(false);
    }
  });

  it("requires positive buy-ins, nonnegative cash-outs and signed nonzero adjustments", () => {
    expect(accepts(PlayEntry, entry)).toBe(true);
    expect(accepts(PlayEntry, { ...entry, kind: "cash_out", amount: 0 })).toBe(true);
    expect(accepts(PlayEntry, { ...entry, kind: "adjustment", amount: -100 })).toBe(true);
    expect(accepts(PlayEntry, { ...entry, kind: "adjustment", amount: 100 })).toBe(true);
    for (const fields of [
      { amount: 0 },
      { amount: -1 },
      { amount: 0.1 },
      { amount: Number.MAX_SAFE_INTEGER + 1 },
      { kind: "cash_out", amount: -1 },
      { kind: "adjustment", amount: 0 },
      { kind: "adjustment", counterpartyId: BEA },
      { visitId: null },
      { currency: "EUR" },
    ])
      expect(accepts(PlayEntry, { ...entry, ...fields })).toBe(false);
  });

  it("resolves ownership through the visit and rejects self-counterparties and foreign facts", () => {
    expect(accepts(VisitRecording, { visit, entries: [entry] })).toBe(true);
    expect(accepts(VisitRecording, { visit, entries: [{ ...entry, counterpartyId: BEA }] })).toBe(
      true,
    );
    expect(accepts(VisitRecording, { visit, entries: [{ ...entry, counterpartyId: ALEX }] })).toBe(
      false,
    );
    expect(accepts(VisitRecording, { visit, entries: [{ ...entry, visitId: TABLE }] })).toBe(false);
    expect(accepts(VisitRecording, { visit, entries: [entry, entry] })).toBe(false);
  });

  it("retains audit and replacement links with consistent void fields", () => {
    expect(accepts(PlayEntry, { ...entry, voidedAt: LATER, voidedBy: ACTOR })).toBe(true);
    for (const fields of [
      { voidedAt: LATER },
      { voidedBy: ACTOR },
      { voidReason: "wrong amount" },
      { voidedAt: LATER, voidedBy: "user_guest" },
      { replacesEntryId: entry.id },
      { voidedAt: "2026-11-05T20:00:00.000Z", voidedBy: ACTOR },
    ])
      expect(accepts(PlayEntry, { ...entry, ...fields })).toBe(false);
  });

  it("distinguishes pending results from finished zero at the public boundary", () => {
    const summary = {
      visit,
      totals: { buyIn: 20000, cashOut: 20000, adjustment: 0 },
      finalResult: null,
    };
    expect(accepts(VisitSummary, summary)).toBe(true);
    expect(accepts(VisitSummary, { ...summary, finalResult: 0 })).toBe(false);
    expect(
      accepts(VisitSummary, { ...summary, visit: { ...visit, finishedAt: LATER }, finalResult: 0 }),
    ).toBe(true);
    expect(accepts(VisitSummary, { ...summary, visit: { ...visit, finishedAt: LATER } })).toBe(
      false,
    );
    expect(
      accepts(VisitSummary, {
        ...summary,
        visit: { ...visit, finishedAt: LATER },
        finalResult: 100,
      }),
    ).toBe(false);
  });
});

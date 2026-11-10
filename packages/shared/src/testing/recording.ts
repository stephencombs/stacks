import * as DateTime from "effect/DateTime";
import {
  ActorId,
  EntryId,
  MinorUnits,
  PlayerId,
  TableId,
  VisitId,
  type PlayEntry,
  type Repayment,
  type Table,
  type Visit,
} from "@stacks/contracts";

export const ALEX = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
export const BEA = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
export const CAL = PlayerId.make("0192e7a0-0000-7000-8000-000000000003");
export const ACTOR = ActorId.make("0192e7a0-0000-7000-8000-000000000004");
const AT = DateTime.makeUnsafe("2026-11-06T20:00:00Z");
export const LATER = DateTime.makeUnsafe("2026-11-06T21:00:00Z");
export const table: Table = {
  id: TableId.make("0192e7a0-0000-7000-8000-0000000000a1"),
  tripId: null,
  game: null,
  venueId: null,
  highLimit: false,
  starterPlayerId: ALEX,
};
export const visit: Visit = {
  id: VisitId.make("0192e7a0-0000-7000-8000-0000000000b1"),
  tableId: table.id,
  playerId: ALEX,
  startedAt: AT,
  finishedAt: null,
  revision: 0,
};
export const entryId = (n: number) =>
  EntryId.make(`0192e7a0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const audit = {
  createdBy: ACTOR,
  createdAt: AT,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  replacesEntryId: null,
};
export const play = (fields: Partial<PlayEntry> = {}): PlayEntry => ({
  id: entryId(1),
  visitId: visit.id,
  kind: "buy_in",
  amount: MinorUnits.make(20000),
  currency: "USD",
  counterpartyId: null,
  occurredAt: AT,
  note: null,
  ...audit,
  ...fields,
});
export const repayment = (fields: Partial<Repayment> = {}): Repayment => ({
  id: entryId(100),
  fromPlayerId: ALEX,
  toPlayerId: BEA,
  amount: MinorUnits.make(5000),
  currency: "USD",
  occurredAt: AT,
  note: null,
  recordedFromTripId: null,
  ...audit,
  ...fields,
});

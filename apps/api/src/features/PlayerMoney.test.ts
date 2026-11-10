import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { MinorUnits, PlayerId, type PlayerId as PlayerIdType } from "@stacks/contracts";
import type { RecordingCommand } from "@stacks/contracts/recordingCommands";

import {
  account,
  correctRepayment,
  device,
  finish,
  rebuy,
  recorderCommand,
  repay,
  sharedTable,
  sitDown,
  start,
  uuid,
  voidRepayment,
} from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";

type Recorder = Effect.Success<ReturnType<typeof device>>;

/** Alex started a shared table and Bea joined it from her own device, with a visit each. */
const table = Effect.fn("test.moneyTable")(function* () {
  const { starter: alex, opened, token } = yield* sharedTable();
  const bea = yield* device();
  const { player } = yield* bea.join(token, { id: PlayerId.make(uuid()), displayName: "Bea" });
  const sat = sitDown(bea.identity, opened.tableId, player.id);
  expect(yield* bea.push(sat)).toEqual(["accepted"]);
  return { alex, bea, beaId: player.id, alexId: alex.identity.playerId, opened, sat, token };
});

const joinAs = Effect.fn("test.joinAs")(function* (
  recorder: Recorder,
  token: string,
  displayName: string,
) {
  const { player } = yield* recorder.join(token, { id: PlayerId.make(uuid()), displayName });
  return player.id;
});

const balanceOf = Effect.fn("test.balanceOf")(function* (
  recorder: Recorder,
  counterpartyId: PlayerIdType,
) {
  const { pairs } = yield* recorder.client.recording.balances();
  return pairs.find((pair) => pair.counterparty.id === counterpartyId)?.balance;
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("money between players", (it) => {
  it.effect("follows the PLAN examples, seen the same way from both sides", () =>
    Effect.gen(function* () {
      const { alex, bea, alexId, beaId, opened } = yield* table();
      // Bea covers Alex's $100 rebuy: Alex owes Bea $100.
      const covered = {
        ...rebuy(alex.identity, opened.visitId),
        amount: MinorUnits.make(10000),
        counterpartyId: beaId,
      };
      expect(yield* alex.push(covered)).toEqual(["accepted"]);
      const owed = { debtorId: alexId, creditorId: beaId, amount: 10000 };
      expect(yield* balanceOf(alex, beaId)).toEqual(owed);
      expect(yield* balanceOf(bea, alexId)).toEqual(owed);

      // Alex repays $50: the balance moves by $50.
      expect(yield* bea.push(repay(bea.identity, alexId, beaId, 5000))).toEqual(["accepted"]);
      expect(yield* balanceOf(alex, beaId)).toEqual({ ...owed, amount: 5000 });

      // Bea receives Alex's $300 cash-out: Bea owes Alex $300, less the $50 Alex still owes.
      const held = {
        ...(finish(alex.identity, opened.visitId, 1) as Extract<
          RecordingCommand,
          { type: "finish" }
        >),
        amount: MinorUnits.make(30000),
        counterpartyId: beaId,
      };
      expect(yield* alex.push(held)).toEqual(["accepted"]);
      expect(yield* balanceOf(bea, alexId)).toEqual({
        debtorId: beaId,
        creditorId: alexId,
        amount: 25000,
      });

      // Bea's device pulls the payment and the entries naming her.
      const history = yield* bea.client.recording.history();
      expect(history.commands.some((command) => command.type === "repay")).toBe(true);
      const pair = yield* bea.client.recording.pair({ params: { playerId: alexId } });
      expect(pair.pair.playerId).toBe(beaId);
      expect(pair.revision).toBe(1);
      expect(pair.play.map((item) => [item.entry.kind, item.entry.counterpartyId])).toEqual([
        ["buy_in", beaId],
        ["cash_out", beaId],
      ]);
    }),
  );

  it.effect("lets only the two players record a payment, never a third or a recorder", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea, alexId, beaId, opened, token } = yield* table();
      const cal = yield* device();
      yield* joinAs(cal, token, "Cal");
      expect(yield* cal.push(repay(cal.identity, alexId, beaId, 5000))).toEqual(["forbidden"]);

      // Dee has an account and records for everyone at the table, but not their payments.
      const dee = yield* account("dee");
      const deeId = yield* joinAs(dee, token, "Dee");
      expect(
        yield* alex.push(recorderCommand("appoint_recorder", alex.identity, opened.tableId, deeId)),
      ).toEqual(["accepted"]);
      expect(yield* dee.push(repay(dee.identity, alexId, beaId, 5000))).toEqual(["forbidden"]);

      // Neither can void or correct one either.
      const paid = repay(alex.identity, alexId, beaId, 5000);
      expect(yield* alex.push(paid)).toEqual(["accepted"]);
      expect(yield* dee.push(voidRepayment(dee.identity, paid.repaymentId, 1))).toEqual([
        "forbidden",
      ]);
      expect(yield* cal.push(correctRepayment(cal.identity, paid.repaymentId, 1, 1))).toEqual([
        "forbidden",
      ]);
      // Bea, the other end, can.
      expect(yield* bea.push(voidRepayment(bea.identity, paid.repaymentId, 1))).toEqual([
        "accepted",
      ]);
      const rows = yield* sql`select voided_by from repayments where id = ${paid.repaymentId}`;
      expect(rows).toEqual([{ voidedBy: bea.identity.actorId }]);
    }),
  );

  it.effect("refuses a counterparty from another table", () =>
    Effect.gen(function* () {
      const { alex, alexId, opened } = yield* table();
      const eve = yield* device();
      const elsewhere = start(eve.identity);
      expect(yield* eve.push(elsewhere)).toEqual(["accepted"]);
      const covered = {
        ...rebuy(alex.identity, opened.visitId),
        counterpartyId: eve.identity.playerId,
      };
      expect(yield* alex.push(covered)).toEqual(["invalid"]);
      // Nor the player themselves.
      const own = { ...rebuy(alex.identity, opened.visitId), counterpartyId: alexId };
      expect(yield* alex.push(own)).toEqual(["invalid"]);
    }),
  );

  it.effect("hides anyone the caller has never shared a table with", () =>
    Effect.gen(function* () {
      const { alex, bea, alexId, beaId } = yield* table();
      const eve = yield* device();
      expect(yield* eve.push(start(eve.identity))).toEqual(["accepted"]);
      const eveId = eve.identity.playerId;
      expect(yield* alex.push(repay(alex.identity, alexId, eveId, 5000))).toEqual(["forbidden"]);
      expect(
        yield* alex.client.recording.pair({ params: { playerId: eveId } }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound", resource: "player" });
      expect(
        yield* eve.client.recording.pair({ params: { playerId: alexId } }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound" });
      expect(
        yield* alex.client.recording
          .pair({ params: { playerId: PlayerId.make(uuid()) } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound" });
      expect((yield* eve.client.recording.balances()).pairs).toEqual([]);
      expect((yield* bea.client.recording.pair({ params: { playerId: alexId } })).pair).toEqual({
        playerId: beaId,
        counterparty: { id: alexId, displayName: "Starter" },
        balance: null,
      });
    }),
  );

  it.effect("never returns pairs that don't involve the caller", () =>
    Effect.gen(function* () {
      const { alex, alexId, beaId, opened, token } = yield* table();
      const cal = yield* device();
      const calId = yield* joinAs(cal, token, "Cal");
      expect(yield* cal.push(sitDown(cal.identity, opened.tableId, calId))).toEqual(["accepted"]);
      expect(yield* alex.push(repay(alex.identity, alexId, beaId, 7000))).toEqual(["accepted"]);
      const { pairs } = yield* cal.client.recording.balances();
      const own = [cal.identity.playerId, calId];
      expect(pairs.length).toBeGreaterThan(0);
      for (const pair of pairs) {
        expect(own).toContain(pair.playerId);
        expect(pair.balance).toBeNull();
      }
      expect(pairs.map((pair) => pair.counterparty.id).toSorted()).toEqual(
        [alexId, beaId].toSorted(),
      );
      // Cal's pull carries nothing of Alex and Bea's payment.
      const history = yield* cal.client.recording.history();
      expect(history.commands.some((command) => command.type === "repay")).toBe(false);
    }),
  );

  it.effect("keeps a void and its replacement in the history, with who made them", () =>
    Effect.gen(function* () {
      const { alex, bea, alexId, beaId } = yield* table();
      const paid = repay(alex.identity, alexId, beaId, 5000);
      expect(yield* alex.push(paid)).toEqual(["accepted"]);
      const corrected = correctRepayment(bea.identity, paid.repaymentId, 3000, 1);
      expect(yield* bea.push(corrected)).toEqual(["accepted"]);
      // The corrected original can't be corrected again; its replacement can.
      expect(yield* alex.push(voidRepayment(alex.identity, paid.repaymentId, 2))).toEqual([
        "invalid",
      ]);
      const history = yield* alex.client.recording.pair({ params: { playerId: beaId } });
      expect(history.revision).toBe(2);
      expect(
        history.repayments.map((item) => [
          item.amount,
          item.voidedAt !== null,
          item.replacesEntryId,
          item.createdBy,
          item.voidedBy,
        ]),
      ).toEqual([
        [5000, true, null, alex.identity.actorId, bea.identity.actorId],
        [3000, false, paid.repaymentId, bea.identity.actorId, null],
      ]);
      expect(history.pair.balance).toEqual({ debtorId: beaId, creditorId: alexId, amount: 3000 });
      expect(history.actors.map((actor) => actor.actorId).toSorted()).toEqual(
        [alex.identity.actorId, bea.identity.actorId].toSorted(),
      );
      expect(yield* alex.push(voidRepayment(alex.identity, corrected.replacement.id, 2))).toEqual([
        "accepted",
      ]);
      expect(yield* balanceOf(alex, beaId)).toBeNull();
    }),
  );

  it.effect("treats a retried payment as one, and refuses a reused operation ID", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, alexId, beaId } = yield* table();
      const paid = repay(alex.identity, alexId, beaId, 5000);
      expect(yield* alex.push(paid, paid)).toEqual(["accepted", "accepted"]);
      expect(yield* alex.push(paid)).toEqual(["accepted"]);
      expect(
        yield* sql`select 1 from repayments where from_player_id = ${alexId} and to_player_id = ${beaId}`,
      ).toHaveLength(1);
      expect(yield* alex.push({ ...paid, amount: MinorUnits.make(6000) })).toEqual([
        "operation_reused",
      ]);
      // A new operation reusing the payment's ID is refused too.
      expect(
        yield* alex.push({
          ...paid,
          operationId: repay(alex.identity, alexId, beaId, 1).operationId,
          expectedRevision: 1,
        }),
      ).toEqual(["conflict"]);
    }),
  );

  it.effect("serializes concurrent payments on one pair", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea, alexId, beaId } = yield* table();
      const results = yield* Effect.all(
        [
          alex.push(repay(alex.identity, alexId, beaId, 5000)),
          bea.push(repay(bea.identity, beaId, alexId, 2000)),
          alex.push(repay(alex.identity, alexId, beaId, 1000)),
        ],
        { concurrency: "unbounded" },
      );
      expect(results.flat().toSorted()).toEqual(["accepted", "conflict", "conflict"]);
      const rows = yield* sql`
        select 1 from repayments where from_player_id in (${alexId}, ${beaId})
          and to_player_id in (${alexId}, ${beaId})
      `;
      expect(rows).toHaveLength(1);
      // The next payment expects the pair's new revision.
      expect(yield* bea.push(repay(bea.identity, beaId, alexId, 2000, 1))).toEqual(["accepted"]);
      expect(yield* bea.push(repay(bea.identity, beaId, alexId, 2000, 1))).toEqual(["conflict"]);
    }),
  );
});

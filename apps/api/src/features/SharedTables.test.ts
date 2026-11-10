import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { ActorId, EntryId, PlayerId, TableId, VisitId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";

import { usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

const uuid = () => crypto.randomUUID();
const at = (minutes: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 7, 20, minutes));
const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/** A signed-out device: its identity, its credential and a client that sends it. */
const device = Effect.fn("test.device")(function* () {
  const api = yield* TestApi;
  const identity: RecordingIdentity = {
    playerId: PlayerId.make(uuid()),
    actorId: ActorId.make(uuid()),
  };
  const credential = { actorId: identity.actorId, secret: secret() };
  yield* (yield* api.asActor(null)).publicRecording.registerActor({ payload: credential });
  return { identity, credential, client: yield* api.asActor(credential) };
});

const common = (identity: RecordingIdentity) => ({
  operationId: RecordingOperationId.make(uuid()),
  actorId: identity.actorId,
  preparedAt: at(0),
});

const start = (identity: RecordingIdentity) =>
  RecordingCommand.make({
    type: "start",
    ...common(identity),
    tableId: TableId.make(uuid()),
    visitId: VisitId.make(uuid()),
    playerId: identity.playerId,
    buyInId: EntryId.make(uuid()),
    buyIn: usd(20000),
    startedAt: at(0),
    game: "blackjack",
    venueId: null,
    highLimit: false,
  }) as Extract<RecordingCommand, { type: "start" }>;

const addGuest = (identity: RecordingIdentity, tableId: TableId, name = "Bea") => {
  const playerId = PlayerId.make(uuid());
  return RecordingCommand.make({
    type: "join_table",
    ...common(identity),
    tableId,
    visitId: VisitId.make(uuid()),
    playerId,
    newPlayer: { id: playerId, displayName: name },
    buyInId: EntryId.make(uuid()),
    buyIn: usd(10000),
    startedAt: at(5),
  }) as Extract<RecordingCommand, { type: "join_table" }>;
};

const buyIn = (identity: RecordingIdentity, visitId: VisitId, expectedRevision = 0) =>
  RecordingCommand.make({
    type: "add",
    ...common(identity),
    preparedAt: at(10),
    visitId,
    expectedRevision,
    entryId: EntryId.make(uuid()),
    kind: "buy_in",
    amount: usd(5000),
    occurredAt: at(10),
    note: null,
  });

const outcomes = (results: ReadonlyArray<{ readonly status: string; readonly reason?: string }>) =>
  results.map((result) => result.reason ?? result.status);

it.layer(TestApi.layer, { timeout: "30 seconds" })("shared tables", (it) => {
  it.effect("lets a signed-out starter open a table, add a guest and record for them", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = start(starter.identity);
      const guest = addGuest(starter.identity, opened.tableId);
      const { results } = yield* starter.client.recording.push({
        payload: {
          identity: starter.identity,
          commands: [opened, guest, buyIn(starter.identity, guest.visitId)],
        },
      });
      expect(outcomes(results)).toEqual(["accepted", "accepted", "accepted"]);

      const view = yield* starter.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("starter");
      expect(view.table.starterPlayerId).toBe(starter.identity.playerId);
      expect(view.players.map((player) => player.displayName).toSorted()).toEqual([
        "Bea",
        "Starter",
      ]);
      expect(view.visits.find((item) => item.visit.id === guest.visitId)?.totals.buyIn).toBe(15000);

      // A saved player can join again once their visit is over, never twice at once.
      const { newPlayer: _, ...rest } = guest;
      const savedPlayer = RecordingCommand.make({
        ...rest,
        ...common(starter.identity),
        visitId: VisitId.make(uuid()),
        buyInId: EntryId.make(uuid()),
      });
      const second = yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [savedPlayer] },
      });
      expect(outcomes(second.results)).toEqual(["invalid"]);

      const history = yield* starter.client.recording.history();
      expect(history.identity).toEqual(starter.identity);
      expect(history.commands.map((command) => command.type)).toEqual([
        "start",
        "join_table",
        "add",
      ]);
    }),
  );

  it.effect("refuses a credential that doesn't match the actor or its secret", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const starter = yield* device();
      const other = yield* device();
      const mismatch = yield* starter.client.recording
        .push({ payload: { identity: other.identity, commands: [start(other.identity)] } })
        .pipe(Effect.flip);
      expect(mismatch).toMatchObject({ _tag: "Conflict", reason: "recording_identity" });

      // A command naming another actor than the one that signed the push is refused too.
      const foreign = yield* starter.client.recording.push({
        payload: {
          identity: starter.identity,
          commands: [{ ...start(starter.identity), actorId: other.identity.actorId }],
        },
      });
      expect(outcomes(foreign.results)).toEqual(["invalid"]);

      const forged = yield* api.asActor({ ...starter.credential, secret: secret() });
      const refused = yield* forged.recording
        .push({ payload: { identity: starter.identity, commands: [start(starter.identity)] } })
        .pipe(Effect.flip);
      expect(refused).toMatchObject({ _tag: "Unauthorized" });
      const anonymous = yield* api.asActor(null);
      expect(yield* anonymous.recording.history().pipe(Effect.flip)).toMatchObject({
        _tag: "Unauthorized",
      });

      // Registering someone else's actor ID with another secret doesn't take it over.
      const takeover = yield* anonymous.publicRecording
        .registerActor({ payload: { ...starter.credential, secret: secret() } })
        .pipe(Effect.flip);
      expect(takeover).toMatchObject({ _tag: "Conflict", reason: "actor_taken" });
    }),
  );

  it.effect("gives another actor `forbidden` and writes nothing for it", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [opened] },
      });

      const intruder = yield* device();
      const guest = addGuest(intruder.identity, opened.tableId);
      const attempts = [guest, buyIn(intruder.identity, opened.visitId)];
      const { results } = yield* intruder.client.recording.push({
        payload: { identity: intruder.identity, commands: attempts },
      });
      expect(outcomes(results)).toEqual(["forbidden", "forbidden"]);
      const ids = attempts.map((command) => command.operationId);
      expect(yield* sql`select 1 from personal_operations where id in ${sql.in(ids)}`).toEqual([]);
      expect(
        yield* sql`select 1 from personal_visits where table_id = ${opened.tableId}`,
      ).toHaveLength(1);
      expect(yield* sql`select 1 from players where id = ${guest.playerId}`).toHaveLength(0);
      expect(yield* intruder.client.recording.history()).toMatchObject({ commands: [] });
    }),
  );

  it.effect("shares one table read-only, and a rotated or revoked link stops working", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const starter = yield* device();
      const shown = start(starter.identity);
      const hidden = start(starter.identity);
      const guest = addGuest(starter.identity, shown.tableId);
      yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [shown, hidden, guest] },
      });
      const anonymous = yield* api.asActor(null);

      const first = yield* starter.client.recording.share({ params: { tableId: shown.tableId } });
      const view = yield* anonymous.publicRecording.shared({ params: { token: first.token } });
      expect(view.viewerRole).toBe("viewer");
      expect(view.table.id).toBe(shown.tableId);
      expect(new Set(view.visits.map((item) => item.visit.tableId))).toEqual(
        new Set([shown.tableId]),
      );
      expect(view.visits.map((item) => item.totals.buyIn).toSorted()).toEqual([10000, 20000]);
      expect(JSON.stringify(view)).not.toContain(starter.identity.actorId);

      const second = yield* starter.client.recording.share({ params: { tableId: shown.tableId } });
      const stale = yield* anonymous.publicRecording
        .shared({ params: { token: first.token } })
        .pipe(Effect.flip);
      expect(stale).toMatchObject({ _tag: "NotFound", resource: "table" });
      yield* anonymous.publicRecording.shared({ params: { token: second.token } });

      yield* starter.client.recording.unshare({ params: { tableId: shown.tableId } });
      const revoked = yield* anonymous.publicRecording
        .shared({ params: { token: second.token } })
        .pipe(Effect.flip);
      expect(revoked).toMatchObject({ _tag: "NotFound", resource: "table" });
    }),
  );

  it.effect("answers an unrelated account or actor with 404", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [opened] },
      });
      const { alex } = yield* users("alex");
      const stranger = yield* device();
      const params = { params: { tableId: opened.tableId } };
      for (const client of [alex, stranger.client]) {
        expect(yield* client.recording.table(params).pipe(Effect.flip)).toMatchObject({
          _tag: "NotFound",
        });
        expect(yield* client.recording.share(params).pipe(Effect.flip)).toMatchObject({
          _tag: "NotFound",
        });
        expect(yield* client.recording.unshare(params).pipe(Effect.flip)).toMatchObject({
          _tag: "NotFound",
        });
      }
    }),
  );

  it.effect("lets an account that signs in on the device keep the actor's tables", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [opened] },
      });
      const { alex, bea } = yield* users("alex", "bea");
      yield* alex.claim.claimActor({ payload: starter.credential });
      const history = yield* alex.recording.history();
      expect(history.identity).toEqual(starter.identity);
      expect(history.tables.map((table) => table.id)).toEqual([opened.tableId]);
      yield* alex.recording.push({
        payload: {
          identity: starter.identity,
          commands: [buyIn(starter.identity, opened.visitId)],
        },
      });

      // A second account can't take the same player, and a wrong secret proves nothing.
      yield* bea.claim.claimActor({ payload: starter.credential });
      expect((yield* bea.recording.history()).identity).toBeNull();
      // The claimed actor is the account's now: its old secret no longer signs anything.
      expect(yield* starter.client.recording.history().pipe(Effect.flip)).toMatchObject({
        _tag: "Unauthorized",
      });
      const other = yield* device();
      const wrong = yield* bea.claim
        .claimActor({ payload: { ...other.credential, secret: secret() } })
        .pipe(Effect.flip);
      expect(wrong).toMatchObject({ _tag: "Unauthorized" });
    }),
  );

  it.effect("won't let a device register an account's actor learned from a share link", () =>
    Effect.gen(function* () {
      const api = yield* TestApi;
      const { alex } = yield* users("alex");
      const identity: RecordingIdentity = {
        playerId: PlayerId.make(uuid()),
        actorId: ActorId.make(uuid()),
      };
      const opened = start(identity);
      yield* alex.recording.push({ payload: { identity, commands: [opened] } });
      const { token } = yield* alex.recording.share({ params: { tableId: opened.tableId } });
      const anonymous = yield* api.asActor(null);
      const view = yield* anonymous.publicRecording.shared({ params: { token } });
      expect(JSON.stringify(view)).not.toContain(identity.actorId);

      const stolen = { actorId: identity.actorId, secret: secret() };
      const taken = yield* anonymous.publicRecording
        .registerActor({ payload: stolen })
        .pipe(Effect.flip);
      expect(taken).toMatchObject({ _tag: "Conflict", reason: "actor_taken" });
      const attacker = yield* api.asActor(stolen);
      expect(yield* attacker.recording.history().pipe(Effect.flip)).toMatchObject({
        _tag: "Unauthorized",
      });
    }),
  );

  it.effect("won't let an account take a device's actor as its own", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = start(starter.identity);
      yield* starter.client.recording.push({
        payload: { identity: starter.identity, commands: [opened] },
      });
      const { bea } = yield* users("bea");
      const borrowed = { playerId: PlayerId.make(uuid()), actorId: starter.identity.actorId };
      const refused = yield* bea.recording
        .push({ payload: { identity: borrowed, commands: [buyIn(borrowed, opened.visitId)] } })
        .pipe(Effect.flip);
      expect(refused).toMatchObject({ _tag: "Conflict", reason: "recording_identity" });
      expect((yield* bea.recording.history()).identity).toBeNull();

      expect((yield* starter.client.recording.history()).identity).toEqual(starter.identity);
    }),
  );

  it.effect("lets an account claim a device's actor that registered but never pushed", () =>
    Effect.gen(function* () {
      const fresh = yield* device();
      const { cal, dee } = yield* users("cal", "dee");
      const opened = start(fresh.identity);
      // Without the secret, the device's actor isn't the account's to use.
      const refused = yield* dee.recording
        .push({ payload: { identity: fresh.identity, commands: [opened] } })
        .pipe(Effect.flip);
      expect(refused).toMatchObject({ _tag: "Conflict", reason: "recording_identity" });

      // Signed in on the device itself, the claim proves the secret and the account records as it.
      yield* cal.claim.claimActor({ payload: fresh.credential });
      const { results } = yield* cal.recording.push({
        payload: { identity: fresh.identity, commands: [opened] },
      });
      expect(results.map((result) => result.status)).toEqual(["accepted"]);
      expect((yield* cal.recording.history()).identity).toEqual(fresh.identity);
      expect(yield* fresh.client.recording.history().pipe(Effect.flip)).toMatchObject({
        _tag: "Unauthorized",
      });
    }),
  );

  it.effect("rolls back a claim that loses a race, leaving the other device's actor working", () =>
    Effect.gen(function* () {
      const devices = [yield* device(), yield* device()];
      for (const item of devices)
        yield* item.client.recording.push({
          payload: { identity: item.identity, commands: [start(item.identity)] },
        });
      const { eve } = yield* users("eve");
      const outcomes = yield* Effect.forEach(
        devices,
        (item) =>
          eve.claim.claimActor({ payload: item.credential }).pipe(
            Effect.as("claimed"),
            Effect.catchTag("Conflict", (conflict) => Effect.succeed(conflict.reason)),
          ),
        { concurrency: "unbounded" },
      );
      expect(outcomes.toSorted()).toEqual(["claimed", "recording_identity"]);
      const loser = devices[outcomes.indexOf("recording_identity")]!;
      expect((yield* loser.client.recording.history()).identity).toEqual(loser.identity);
    }),
  );
});

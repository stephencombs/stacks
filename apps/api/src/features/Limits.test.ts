import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/sql/SqlClient";
import { CurrencyCode, UpdateLimitsRequest } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

it("distinguishes no limit from zero and rejects unsupported reminders", () => {
  const decode = Schema.decodeUnknownOption(UpdateLimitsRequest);
  expect(decode({ lossLimit: null, sessionReminderMinutes: null })._tag).toBe("Some");
  expect(decode({ lossLimit: 0, sessionReminderMinutes: null })._tag).toBe("None");
  expect(decode({ lossLimit: null, sessionReminderMinutes: 60 })._tag).toBe("None");
});

it.effect("returns each viewer's actual join time and only their ledger details", () =>
  Effect.gen(function* () {
    const { alex, bea, chris } = yield* users("alex", "bea", "chris");
    const group = yield* groupWith(alex, bea, chris);
    const beaGroup = yield* bea.groups.get({ params: { groupId: group.group.id } });
    const venue = yield* catalogVenue(alex);
    const session = yield* alex.sessions.create({
      params: { tripId: group.tripId },
      payload: {
        id: ids.session(),
        venueId: venue.id,
        game: "poker_cash",
        playerIds: [group.myPlayerId],
        notes: null,
      },
    });
    yield* alex.sessions.addPlayer({
      params: { sessionId: session.session.id },
      payload: { playerId: beaGroup.myPlayerId },
    });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`update session_players set joined_at = ${new Date("2026-11-02T21:30:00Z")} where session_id = ${session.session.id} and player_id = ${beaGroup.myPlayerId}`;
    const entryId = ids.entry();
    yield* alex.ledger.addEntry({
      params: { sessionId: session.session.id },
      payload: {
        id: entryId,
        playerId: group.myPlayerId,
        counterpartyId: null,
        kind: "buy_in",
        amount: usd(500),
        note: null,
        replacesEntryId: null,
      },
    });
    const beaTrip = yield* bea.trips.get({ params: { tripId: group.tripId } });
    const beaSession = yield* bea.sessions.get({ params: { sessionId: session.session.id } });
    expect(DateTime.formatIso(beaTrip.sessions[0]!.myJoinedAt!)).toBe("2026-11-02T21:30:00.000Z");
    expect(DateTime.formatIso(beaSession.myJoinedAt!)).toBe("2026-11-02T21:30:00.000Z");
    expect(beaTrip.sessions[0]!.ledgerEntryIds).toContain(entryId);
    expect(beaTrip.sessions[0]!.myLedgerEntries).toEqual([]);
    const chrisTrip = yield* chris.trips.get({ params: { tripId: group.tripId } });
    expect(chrisTrip.sessions[0]!.myJoinedAt).toBeNull();
    expect(chrisTrip.sessions[0]!.myLedgerEntries).toEqual([]);
    const alexTrip = yield* alex.trips.get({ params: { tripId: group.tripId } });
    expect(alexTrip.sessions[0]!.myLedgerEntries).toMatchObject([{ id: entryId, amount: 500 }]);
  }).pipe(Effect.provide(TestApi.layer)),
);

it.layer(TestApi.layer, { timeout: "30 seconds" })("limits", (it) => {
  it.effect("isolates each trip and user, authorizes access, and never blocks entries", () =>
    Effect.gen(function* () {
      const { alex, bea, eve } = yield* users("alex", "bea", "eve");
      const group = yield* groupWith(alex, bea);
      const reno = yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Reno" },
      });
      const vegas = { tripId: group.tripId };
      const other = { tripId: reno.id };
      const defaults = { lossLimit: null, currency: "USD", sessionReminderMinutes: null };
      expect(yield* alex.limits.get({ params: vegas })).toEqual(defaults);
      yield* alex.limits.update({
        params: vegas,
        payload: { lossLimit: usd(10000), sessionReminderMinutes: 120 },
      });
      yield* alex.limits.update({
        params: other,
        payload: { lossLimit: usd(25000), sessionReminderMinutes: 120 },
      });
      yield* bea.limits.update({
        params: vegas,
        payload: { lossLimit: usd(50000), sessionReminderMinutes: 240 },
      });
      expect(yield* alex.limits.get({ params: vegas })).toEqual({
        lossLimit: 10000,
        currency: "USD",
        sessionReminderMinutes: 120,
      });
      expect(yield* alex.limits.get({ params: other })).toEqual({
        lossLimit: 25000,
        currency: "USD",
        sessionReminderMinutes: 120,
      });
      expect(yield* bea.limits.get({ params: other })).toEqual({
        ...defaults,
        sessionReminderMinutes: 240,
      });
      expect(yield* Effect.flip(eve.limits.get({ params: vegas }))).toMatchObject({
        _tag: "Forbidden",
      });
      expect(
        yield* Effect.flip(
          eve.limits.update({
            params: vegas,
            payload: { lossLimit: usd(1), sessionReminderMinutes: null },
          }),
        ),
      ).toMatchObject({ _tag: "Forbidden" });
      yield* alex.limits.update({
        params: vegas,
        payload: { lossLimit: null, sessionReminderMinutes: null },
      });
      expect((yield* alex.limits.get({ params: vegas })).lossLimit).toBeNull();
      expect((yield* alex.limits.get({ params: other })).lossLimit).toBe(25000);
      expect((yield* bea.limits.get({ params: vegas })).lossLimit).toBe(50000);

      const venue = yield* catalogVenue(alex);
      const session = yield* alex.sessions.create({
        params: vegas,
        payload: {
          id: ids.session(),
          venueId: venue.id,
          game: "poker_cash",
          playerIds: [group.myPlayerId],
          notes: null,
        },
      });
      yield* alex.limits.update({
        params: vegas,
        payload: { lossLimit: usd(10000), sessionReminderMinutes: null },
      });
      yield* alex.ledger.addEntry({
        params: { sessionId: session.session.id },
        payload: {
          id: ids.entry(),
          playerId: group.myPlayerId,
          counterpartyId: null,
          kind: "buy_in",
          amount: usd(30000),
          note: null,
          replacesEntryId: null,
        },
      });
      for (const view of [
        yield* bea.groups.get({ params: { groupId: group.group.id } }),
        yield* bea.trips.get({ params: vegas }),
        yield* bea.sessions.get({ params: { sessionId: session.session.id } }),
      ]) {
        expect(JSON.stringify(view)).not.toContain("lossLimit");
        expect(JSON.stringify(view)).not.toContain("sessionReminderMinutes");
      }
    }),
  );
  it.effect("uses the trip group's currency rather than another group's currency", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const groupId = ids.group();
      yield* alex.groups.create({
        payload: {
          id: groupId,
          name: "Tokyo",
          currency: CurrencyCode.make("JPY"),
          displayName: "Alex",
        },
      });
      const tripId = ids.trip();
      yield* alex.trips.create({ params: { groupId }, payload: { id: tripId, name: "Tokyo" } });
      expect(
        yield* alex.limits.update({
          params: { tripId },
          payload: { lossLimit: usd(5000), sessionReminderMinutes: null },
        }),
      ).toEqual({ lossLimit: 5000, currency: "JPY", sessionReminderMinutes: null });
    }),
  );
});

import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { StakeId, type PlayerId } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users, type TestGroup } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const day = (n: number) => DateTime.makeUnsafe(`2026-10-${20 + n}T20:00:00Z`);

/** A session on `day` where `playerId` wins (or loses) `net`. */
const play = Effect.fn("test.play")(function* (
  client: Client,
  group: TestGroup,
  playerId: PlayerId,
  net: number,
  on: number,
) {
  const venue = yield* catalogVenue(client);
  const sessionId = ids.session();
  yield* client.sessions.create({
    params: { tripId: group.tripId },
    payload: {
      id: sessionId,
      venueId: venue.id,
      game: "blackjack",
      playerIds: [playerId],
      notes: null,
      startedAt: day(on),
    },
  });
  yield* client.ledger.addEntry({
    params: { sessionId },
    payload: {
      id: ids.entry(),
      kind: "adjustment",
      playerId,
      counterpartyId: null,
      amount: usd(net),
      note: null,
      replacesEntryId: null,
    },
  });
});

const back = (client: Client, group: TestGroup, lender: PlayerId, borrower: PlayerId) =>
  client.stakes.create({
    params: { tripId: group.tripId },
    payload: {
      id: StakeId.make(crypto.randomUUID()),
      lenderId: lender,
      borrowerId: borrower,
      amount: usd(100000),
      lenderShare: 50,
      startedAt: day(1),
      note: null,
    },
  });

it.layer(TestApi.layer, { timeout: "30 seconds" })("stakes", (it) => {
  it.effect("pays the backer their stake plus half the winnings, through balances", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const lender = group.myPlayerId;
      const borrower = group.players.find((p) => p.id !== lender)!.id;
      const stake = yield* back(alex, group, lender, borrower);

      const before = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(before.balances).toEqual(
        expect.arrayContaining([
          { playerId: lender, amount: 100000 },
          { playerId: borrower, amount: -100000 },
        ]),
      );

      yield* play(alex, group, borrower, 40000, 2);
      const after = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(after.stakes).toEqual([
        { stake: expect.objectContaining({ id: stake.id }), result: 40000, owed: 120000 },
      ]);
      expect(after.balances).toEqual(
        expect.arrayContaining([
          { playerId: lender, amount: 120000 },
          { playerId: borrower, amount: -120000 },
        ]),
      );
      const [listed] = yield* alex.groups.list();
      expect(listed?.myBalance).toBe(120000);
    }),
  );

  it.effect("covers sessions while it's open, and can be ended, reopened and voided", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const lender = group.myPlayerId;
      const borrower = group.players.find((p) => p.id !== lender)!.id;
      const stake = yield* back(alex, group, lender, borrower);
      const owed = () =>
        alex.trips
          .get({ params: { tripId: group.tripId } })
          .pipe(Effect.map((detail) => detail.stakes[0]!));

      yield* play(alex, group, borrower, -30000, 2);
      yield* bea.stakes.end({ params: { stakeId: stake.id }, payload: { endedAt: day(3) } });
      yield* play(alex, group, borrower, 99900, 4);
      expect(yield* owed()).toMatchObject({ result: -30000, owed: 70000 });
      expect(
        yield* Effect.flip(bea.stakes.end({ params: { stakeId: stake.id }, payload: {} })),
      ).toMatchObject({ _tag: "Conflict", reason: "stake_ended" });

      yield* bea.stakes.reopen({ params: { stakeId: stake.id } });
      expect(yield* owed()).toMatchObject({ result: 69900, owed: 134950 });
      expect(
        yield* Effect.flip(bea.stakes.reopen({ params: { stakeId: stake.id } })),
      ).toMatchObject({ _tag: "Conflict", reason: "stake_open" });

      const voided = yield* alex.stakes.void({
        params: { stakeId: stake.id },
        payload: { reason: "Wrong amount" },
      });
      expect(voided.voidReason).toBe("Wrong amount");
      const detail = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(detail.balances).toEqual([]);
      expect(detail.stakes).toEqual([
        { stake: expect.objectContaining({ voidReason: "Wrong amount" }), result: 0, owed: 0 },
      ]);
      expect(
        yield* Effect.flip(
          alex.stakes.void({ params: { stakeId: stake.id }, payload: { reason: null } }),
        ),
      ).toMatchObject({ _tag: "Conflict", reason: "stake_voided" });
    }),
  );

  it.effect("lets only the two players, whoever added it or an admin change a stake", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, eve } = yield* users("alex", "bea", "cal", "eve");
      const group = yield* groupWith(alex, bea, cal);
      const lender = group.myPlayerId;
      const [borrower, bystander] = group.players.filter((p) => p.id !== lender).map((p) => p.id);
      const stake = yield* back(bea, group, lender, borrower!);

      expect(
        yield* Effect.flip(
          cal.stakes.void({ params: { stakeId: stake.id }, payload: { reason: null } }),
        ),
      ).toMatchObject({ _tag: "Forbidden", reason: "not_your_stake" });
      expect(
        yield* Effect.flip(eve.stakes.end({ params: { stakeId: stake.id }, payload: {} })),
      ).toMatchObject({ _tag: "Forbidden", reason: "not_a_member" });
      expect(yield* Effect.flip(back(cal, group, bystander!, bystander!))).toMatchObject({
        _tag: "InvalidRequest",
      });
      yield* bea.stakes.end({ params: { stakeId: stake.id }, payload: { endedAt: day(2) } });
      yield* alex.stakes.reopen({ params: { stakeId: stake.id } });
    }),
  );
});

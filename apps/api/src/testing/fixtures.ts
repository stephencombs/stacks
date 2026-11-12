import * as Effect from "effect/Effect";
import {
  CurrencyCode,
  EntryId,
  GroupId,
  InviteId,
  MinorUnits,
  PlayerId,
  SeatingId,
  SessionId,
  StakeId,
  TripId,
  VenueId,
} from "@stacks/contracts";

import { TestApi } from "./TestApi.ts";

export const ids = {
  group: () => GroupId.make(crypto.randomUUID()),
  invite: () => InviteId.make(crypto.randomUUID()),
  player: () => PlayerId.make(crypto.randomUUID()),
  session: () => SessionId.make(crypto.randomUUID()),
  entry: () => EntryId.make(crypto.randomUUID()),
  venue: () => VenueId.make(crypto.randomUUID()),
  trip: () => TripId.make(crypto.randomUUID()),
  seating: () => SeatingId.make(crypto.randomUUID()),
  stake: () => StakeId.make(crypto.randomUUID()),
};

export const usd = (amount: number) => MinorUnits.make(amount);

/**
 * Test users are unique per call, so tests sharing the database never see each other's groups.
 */
export const users = <const Names extends ReadonlyArray<string>>(...names: Names) =>
  Effect.gen(function* () {
    const api = yield* TestApi;
    const run = crypto.randomUUID().slice(0, 8);
    const clients = yield* Effect.forEach(names, (name) => api.as(`${name}_${run}`));
    return Object.fromEntries(names.map((name, i) => [name, clients[i]!])) as {
      readonly [K in Names[number]]: (typeof clients)[number];
    };
  });

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

/**
 * A group owned by `owner`, with every other client joined through an invite, and an open trip to
 * play in: `tripId`.
 */
export const groupWith = Effect.fn("fixtures.groupWith")(function* (
  owner: Client,
  ...others: ReadonlyArray<Client>
) {
  const groupId = ids.group();
  yield* owner.groups.create({
    payload: {
      id: groupId,
      name: "Vegas crew",
      currency: CurrencyCode.make("USD"),
      displayName: "Owner",
    },
  });
  const invite = yield* owner.invites.create({
    params: { groupId },
    payload: { id: ids.invite(), maxUses: null },
  });
  for (const [index, member] of others.entries()) {
    yield* member.invites.accept({
      params: { code: invite.code },
      payload: { displayName: `Member ${index + 1}` },
    });
  }
  const trip = yield* owner.trips.create({
    params: { groupId },
    payload: { id: ids.trip(), name: "Vegas" },
  });
  return { ...(yield* owner.groups.get({ params: { groupId } })), tripId: trip.id };
});

export type TestGroup = Effect.Success<ReturnType<typeof groupWith>>;

export const catalogVenue = Effect.fn("fixtures.catalogVenue")(function* (client: Client) {
  return yield* client.venues.create({
    payload: {
      id: ids.venue(),
      name: `Casino ${crypto.randomUUID().slice(0, 6)}`,
      kind: "casino",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      groupId: null,
    },
  });
});

/** A live session where `debtor` buys in with `creditor`'s money, so the debtor owes the creditor. */
export const owe = Effect.fn("fixtures.owe")(function* (
  client: Client,
  group: TestGroup,
  debtor: PlayerId,
  creditor: PlayerId,
  amount: number,
) {
  const venue = yield* catalogVenue(client);
  const sessionId = ids.session();
  yield* client.sessions.create({
    params: { tripId: group.tripId },
    payload: {
      id: sessionId,
      venueId: venue.id,
      game: "blackjack",
      playerIds: [debtor],
      notes: null,
    },
  });
  yield* client.ledger.addEntry({
    params: { sessionId },
    payload: {
      id: ids.entry(),
      kind: "buy_in",
      playerId: debtor,
      counterpartyId: creditor,
      amount: usd(amount),
      note: null,
      replacesEntryId: null,
    },
  });
});

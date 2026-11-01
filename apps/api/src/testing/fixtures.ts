import * as Effect from "effect/Effect";
import {
  CurrencyCode,
  EntryId,
  GroupId,
  InviteId,
  MinorUnits,
  PlayerId,
  SessionId,
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

/** A group owned by `owner`, with every other client joined through an invite. */
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
  return yield* owner.groups.get({ params: { groupId } });
});

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

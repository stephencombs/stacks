import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import {
  CurrencyCode,
  CurrentUser,
  EntryId,
  GroupId,
  InviteId,
  MinorUnits,
  PlayerId,
  SessionId,
  TripId,
  UserId,
  VenueId,
  type Game,
} from "@stacks/contracts";

import { importVenues } from "../src/catalog/importVenues.ts";
import { curatedOnline } from "../src/catalog/osm.ts";
import * as Database from "../src/db/Database.ts";
import * as Groups from "../src/features/Groups.ts";
import * as Guests from "../src/features/Guests.ts";
import * as Invites from "../src/features/Invites.ts";
import * as Ledger from "../src/features/Ledger.ts";
import * as Sessions from "../src/features/Sessions.ts";
import * as Trips from "../src/features/Trips.ts";
import * as Venues from "../src/features/Venues.ts";

// Usage: node scripts/seed.ts [--owner user_xxx]
// Builds one realistic group. Pass your Clerk user ID as --owner to see it when signed in.
// IDs come from a generator seeded by the owner, so running it again changes nothing and each
// owner gets their own group.
const ownerFlag = process.argv.indexOf("--owner");
const ownerId = ownerFlag === -1 ? "seed_alex" : process.argv[ownerFlag + 1]!;
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks";

let state = 20261027;
for (const char of ownerId) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <A>(items: ReadonlyArray<A>) => items[Math.floor(random() * items.length)]!;
const uuid = () => {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
const dollars = (amount: number) => MinorUnits.make(amount * 100);

const user = (id: string, displayName: string) => ({
  userId: UserId.make(id),
  displayName,
  avatarUrl: null,
});
const as = (person: ReturnType<typeof user>) => Effect.provideService(CurrentUser, person);

const owner = user(ownerId, "Alex");
const bea = user("seed_bea", "Bea");
const cal = user("seed_cal", "Cal");

const casinos = [
  ["Bellagio", "Las Vegas", "NV", 36.1126, -115.1767],
  ["Wynn Las Vegas", "Las Vegas", "NV", 36.1263, -115.1657],
  ["Resorts World Las Vegas", "Las Vegas", "NV", 36.1347, -115.1677],
  ["Borgata", "Atlantic City", "NJ", 39.378, -74.4323],
] as const;
const games: ReadonlyArray<Game> = [
  "blackjack",
  "craps",
  "roulette",
  "slots",
  "baccarat",
  "poker_cash",
];

Effect.gen(function* () {
  yield* importVenues([
    ...curatedOnline,
    ...casinos.map(([name, city, region, lat, lng]) => ({
      name,
      kind: "casino" as const,
      city,
      region,
      country: "US",
      lat,
      lng,
      source: "curated" as const,
      sourceRef: `seed-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    })),
  ]);
  const catalog = yield* Effect.forEach(casinos, ([name]) =>
    Venues.search({ q: name }).pipe(Effect.map((found) => found[0]!)),
  ).pipe(as(owner));

  const groupId = GroupId.make(uuid());
  const group = yield* Groups.create({
    id: groupId,
    name: "Vegas crew",
    currency: CurrencyCode.make("USD"),
    displayName: owner.displayName,
  }).pipe(as(owner));
  const invite = yield* Invites.create(groupId, { id: InviteId.make(uuid()), maxUses: null }).pipe(
    as(owner),
  );
  for (const friend of [bea, cal]) {
    yield* Invites.accept(invite.code, { displayName: friend.displayName }).pipe(as(friend));
  }
  const withGuest = yield* Guests.add(groupId, {
    id: PlayerId.make(uuid()),
    displayName: "Dee",
  }).pipe(as(owner));
  const garage = yield* Venues.create({
    id: VenueId.make(uuid()),
    name: "Cal's garage",
    kind: "home",
    city: null,
    region: null,
    country: null,
    groupId,
  }).pipe(as(owner));
  const players = withGuest.players.map((player) => player.id);
  const venues = [...catalog, garage];

  const now = yield* DateTime.now;
  // Three trips a few months apart, ten sessions each. The last one is still going, with a live
  // session at the table.
  const trips = ["Vegas in March", "Reno", "Vegas in the fall"];
  const sessionCount = 10;
  let settlementCount = 0;
  for (const [t, name] of trips.entries()) {
    const current = t === trips.length - 1;
    const tripId = TripId.make(uuid());
    const tripStart = DateTime.subtract(now, { days: (trips.length - 1 - t) * 90 + 2 });
    const trip = yield* Trips.create(groupId, { id: tripId, name, startedAt: tripStart }).pipe(
      as(owner),
    );

    for (let index = 0; index < sessionCount; index++) {
      const isLive = current && index === sessionCount - 1;
      const sessionId = SessionId.make(uuid());
      const startedAt = isLive
        ? DateTime.subtract(now, { hours: 2 })
        : DateTime.add(tripStart, { hours: 10 + index * 4 + between(0, 2) });
      const seated = players.filter(() => random() < 0.75);
      const table = seated.length >= 2 ? seated : players.slice(0, 2);
      yield* Sessions.create(tripId, {
        id: sessionId,
        venueId: pick(venues).id,
        game: pick(games),
        startedAt,
        playerIds: [table[0]!, ...table.slice(1)],
        notes: null,
      }).pipe(as(owner));

      for (const playerId of table) {
        const buyIns = Array.from({ length: between(1, 3) }, () => between(3, 25) * 20);
        for (const [n, amount] of buyIns.entries()) {
          const coveredBy = random() < 0.2 ? pick(table.filter((id) => id !== playerId)) : null;
          yield* Ledger.addEntry(sessionId, {
            id: EntryId.make(uuid()),
            kind: "buy_in",
            playerId,
            counterpartyId: coveredBy ?? null,
            amount: dollars(amount),
            occurredAt: DateTime.add(startedAt, { minutes: 5 + n * 40 }),
            note: null,
            replacesEntryId: null,
          }).pipe(as(owner));
        }
        if (isLive) continue;
        const staked = buyIns.reduce((sum, amount) => sum + amount, 0);
        const keptBy = random() < 0.1 ? pick(table.filter((id) => id !== playerId)) : null;
        yield* Ledger.addEntry(sessionId, {
          id: EntryId.make(uuid()),
          kind: "cash_out",
          playerId,
          counterpartyId: keptBy ?? null,
          amount: dollars(Math.round((staked * between(0, 220)) / 100 / 5) * 5),
          occurredAt: DateTime.add(startedAt, { hours: 3 }),
          note: null,
          replacesEntryId: null,
        }).pipe(as(owner));
      }
      if (isLive) continue;
      yield* Ledger.close(sessionId, {
        endedAt: DateTime.add(startedAt, { hours: between(3, 4) }),
      }).pipe(as(owner));
    }

    if (current) continue;
    // Past trips end, and somebody pays back the biggest debt afterwards.
    const ended = DateTime.add(tripStart, { days: 3 });
    if (trip.endedAt === null) yield* Trips.end(tripId, { endedAt: ended }).pipe(as(owner));
    const transfer = (yield* Trips.get(tripId).pipe(as(owner))).transfers[0];
    if (transfer) {
      settlementCount += 1;
      yield* Ledger.recordSettlement(tripId, {
        id: EntryId.make(uuid()),
        fromPlayerId: transfer.from,
        toPlayerId: transfer.to,
        amount: transfer.amount,
        occurredAt: DateTime.add(ended, { days: 2 }),
        note: "Venmo",
      }).pipe(as(owner));
    }
  }

  const final = yield* Groups.get(groupId).pipe(as(owner));
  yield* Console.log(
    `Seeded "${group.group.name}" (${groupId}) with ${final.players.length} players, ` +
      `${trips.length} trips of ${sessionCount} sessions and ${settlementCount} settlements. ` +
      `Owner: ${ownerId}`,
  );
}).pipe(Effect.provide(Database.layer(url)), NodeRuntime.runMain);

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Conflict, StacksApi } from "@stacks/contracts";

import * as Account from "../features/Account.ts";
import * as Crew from "../features/Crew.ts";
import * as Export from "../features/Export.ts";
import * as Groups from "../features/Groups.ts";
import * as Guests from "../features/Guests.ts";
import * as Invites from "../features/Invites.ts";
import * as PlayerInvites from "../features/PlayerInvites.ts";
import * as Recording from "../features/Recording.ts";
import * as Sessions from "../features/Sessions.ts";
import * as Stakes from "../features/Stakes.ts";
import * as Trips from "../features/Trips.ts";
import * as Stats from "../features/Stats.ts";
import * as Venues from "../features/Venues.ts";

const serve = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.catchTags({ SqlError: Effect.die }));

const health = HttpApiBuilder.group(StacksApi, "health", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ status: "ok", service: "stacks-api" } as const)),
);

const groups = HttpApiBuilder.group(StacksApi, "groups", (handlers) =>
  handlers
    .handle("list", () => serve(Groups.list()))
    .handle("create", ({ payload }) => serve(Groups.create(payload)))
    .handle("get", ({ params }) => serve(Groups.get(params.groupId)))
    .handle("rename", ({ params, payload }) => serve(Groups.rename(params.groupId, payload)))
    .handle("stats", ({ params }) => serve(Stats.forGroup(params.groupId)))
    .handle("exportCsv", ({ params }) => serve(Export.forGroup(params.groupId)))
    .handle("leave", ({ params }) => serve(Groups.leave(params.groupId)))
    .handle("removeMember", ({ params }) =>
      serve(Groups.removeMember(params.groupId, params.userId)),
    )
    .handle("setRole", ({ params, payload }) =>
      serve(Groups.setRole(params.groupId, params.userId, payload)),
    ),
);

const crew = HttpApiBuilder.group(StacksApi, "crew", (handlers) =>
  handlers.handle("activity", ({ query }) => serve(Crew.activity(query))),
);

const invites = HttpApiBuilder.group(StacksApi, "invites", (handlers) =>
  handlers
    .handle("create", ({ params, payload }) => serve(Invites.create(params.groupId, payload)))
    .handle("list", ({ params }) => serve(Invites.list(params.groupId)))
    .handle("revoke", ({ params }) => serve(Invites.revoke(params.inviteId)))
    .handle("preview", ({ params }) => serve(Invites.preview(params.code)))
    .handle("accept", ({ params, payload }) => serve(Invites.accept(params.code, payload))),
);

const guests = HttpApiBuilder.group(StacksApi, "guests", (handlers) =>
  handlers
    .handle("add", ({ params, payload }) => serve(Guests.add(params.groupId, payload)))
    .handle("previewClaim", ({ params }) => serve(Guests.previewClaim(params.code)))
    .handle("claim", ({ params }) => serve(Guests.claim(params.code))),
);

const venues = HttpApiBuilder.group(StacksApi, "venues", (handlers) =>
  handlers
    .handle("search", ({ query }) => serve(Venues.search(query)))
    .handle("recent", ({ params }) => serve(Venues.recent(params.groupId)))
    .handle("create", ({ payload }) => serve(Venues.create(payload))),
);

const publicVenues = HttpApiBuilder.group(StacksApi, "publicVenues", (handlers) =>
  handlers
    .handle("search", ({ query }) => serve(Venues.searchPublic(query)))
    .handle("get", ({ params }) => serve(Venues.getPublic(params.venueId)))
    .handle("resolve", ({ payload }) => serve(Venues.resolvePublic(payload))),
);

const retireLegacyWrite = () => Effect.fail(new Conflict({ reason: "legacy_sessions_retired" }));

const sessions = HttpApiBuilder.group(StacksApi, "sessions", (handlers) =>
  handlers
    .handle("create", retireLegacyWrite)
    .handle("get", ({ params }) => serve(Sessions.get(params.sessionId)))
    .handle("addPlayer", retireLegacyWrite)
    .handle("seat", retireLegacyWrite)
    .handle("setHighLimit", retireLegacyWrite)
    .handle("setTable", retireLegacyWrite)
    .handle("close", retireLegacyWrite)
    .handle("reopen", retireLegacyWrite)
    .handle("move", retireLegacyWrite),
);

const ledger = HttpApiBuilder.group(StacksApi, "ledger", (handlers) =>
  handlers.handle("addEntry", retireLegacyWrite).handle("voidEntry", retireLegacyWrite),
);

const stakes = HttpApiBuilder.group(StacksApi, "stakes", (handlers) =>
  handlers
    .handle("create", ({ params, payload }) => serve(Stakes.create(params.tripId, payload)))
    .handle("end", ({ params, payload }) => serve(Stakes.end(params.stakeId, payload)))
    .handle("reopen", ({ params }) => serve(Stakes.reopen(params.stakeId)))
    .handle("void", ({ params, payload }) => serve(Stakes.voidStake(params.stakeId, payload))),
);

const trips = HttpApiBuilder.group(StacksApi, "trips", (handlers) =>
  handlers
    .handle("create", ({ params, payload }) => serve(Trips.create(params.groupId, payload)))
    .handle("get", ({ params }) => serve(Trips.get(params.tripId)))
    .handle("rename", ({ params, payload }) => serve(Trips.rename(params.tripId, payload)))
    .handle("end", ({ params, payload }) => serve(Trips.end(params.tripId, payload)))
    .handle("reopen", ({ params }) => serve(Trips.reopen(params.tripId)))
    .handle("delete", ({ params }) => serve(Trips.remove(params.tripId))),
);

const recording = HttpApiBuilder.group(StacksApi, "recording", (handlers) =>
  handlers
    .handle("history", () => serve(Recording.history()))
    .handle("push", ({ payload }) => serve(Recording.push(payload)))
    .handle("table", ({ params }) => serve(Recording.table(params.tableId)))
    .handle("share", ({ params }) => serve(Recording.share(params.tableId)))
    .handle("unshare", ({ params }) => serve(Recording.unshare(params.tableId)))
    .handle("join", ({ params, payload }) => serve(Recording.join(params.token, payload)))
    .handle("invitePlayer", ({ params }) => serve(PlayerInvites.issue(params.playerId)))
    .handle("playerAccess", ({ params }) => serve(PlayerInvites.access(params.playerId)))
    .handle("revokeBinding", ({ params }) =>
      serve(PlayerInvites.revokeBinding(params.playerId, params.actorId)),
    )
    .handle("revokeInvite", ({ params }) => serve(PlayerInvites.revoke(params.inviteId)))
    .handle("redeemInvite", ({ params, payload }) =>
      serve(PlayerInvites.redeem(params.token, payload)),
    ),
);

const publicRecording = HttpApiBuilder.group(StacksApi, "publicRecording", (handlers) =>
  handlers
    .handle("registerActor", ({ payload }) => serve(Recording.registerActor(payload)))
    .handle("shared", ({ params }) => serve(Recording.shared(params.token)))
    .handle("previewInvite", ({ params }) => serve(PlayerInvites.preview(params.token))),
);

const claim = HttpApiBuilder.group(StacksApi, "claim", (handlers) =>
  handlers.handle("claimActor", ({ payload }) => serve(Recording.claimActor(payload))),
);

const account = HttpApiBuilder.group(StacksApi, "account", (handlers) =>
  handlers
    .handle("deletionPreview", () => serve(Account.preview()))
    .handle("delete", ({ payload }) => serve(Account.remove(payload))),
);

export const layer = HttpApiBuilder.layer(StacksApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide([
    health,
    groups,
    crew,
    invites,
    guests,
    venues,
    publicVenues,
    sessions,
    ledger,
    stakes,
    trips,
    recording,
    publicRecording,
    claim,
    account,
  ]),
);

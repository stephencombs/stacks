import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { StacksApi } from "@stacks/contracts";

import * as Export from "../features/Export.ts";
import * as Groups from "../features/Groups.ts";
import * as Guests from "../features/Guests.ts";
import * as Invites from "../features/Invites.ts";
import * as Ledger from "../features/Ledger.ts";
import * as Sessions from "../features/Sessions.ts";
import * as Stakes from "../features/Stakes.ts";
import * as Trips from "../features/Trips.ts";
import * as Stats from "../features/Stats.ts";
import * as Venues from "../features/Venues.ts";

/** Database failures are server faults, so they surface as 500s instead of typed errors. */
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
    .handle("stats", ({ params }) => serve(Stats.forGroup(params.groupId)))
    .handle("exportCsv", ({ params }) => serve(Export.forGroup(params.groupId)))
    .handle("leave", ({ params }) => serve(Groups.leave(params.groupId)))
    .handle("removeMember", ({ params }) =>
      serve(Groups.removeMember(params.groupId, params.userId)),
    )
    .handle("setRole", ({ params, payload }) =>
      serve(Groups.setRole(params.groupId, params.userId, payload)),
    )
    .handle("setPaymentHandles", ({ params, payload }) =>
      serve(Groups.setPaymentHandles(params.groupId, params.playerId, payload)),
    ),
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

const sessions = HttpApiBuilder.group(StacksApi, "sessions", (handlers) =>
  handlers
    .handle("create", ({ params, payload }) => serve(Sessions.create(params.tripId, payload)))
    .handle("get", ({ params }) => serve(Sessions.get(params.sessionId)))
    .handle("addPlayer", ({ params, payload }) =>
      serve(Sessions.addPlayer(params.sessionId, payload.playerId)),
    )
    .handle("seat", ({ params, payload }) => serve(Sessions.seat(params.sessionId, payload)))
    .handle("setHighLimit", ({ params, payload }) =>
      serve(Sessions.setHighLimit(params.sessionId, payload)),
    )
    .handle("setTable", ({ params, payload }) =>
      serve(Sessions.setTable(params.sessionId, payload)),
    )
    .handle("close", ({ params, payload }) => serve(Ledger.close(params.sessionId, payload)))
    .handle("reopen", ({ params }) => serve(Sessions.reopen(params.sessionId)))
    .handle("move", ({ params, payload }) => serve(Sessions.move(params.sessionId, payload))),
);

const ledger = HttpApiBuilder.group(StacksApi, "ledger", (handlers) =>
  handlers
    .handle("addEntry", ({ params, payload }) => serve(Ledger.addEntry(params.sessionId, payload)))
    .handle("voidEntry", ({ params, payload }) => serve(Ledger.voidEntry(params.entryId, payload)))
    .handle("recordSettlement", ({ params, payload }) =>
      serve(Ledger.recordSettlement(params.tripId, payload)),
    ),
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
    .handle("end", ({ params, payload }) => serve(Trips.end(params.tripId, payload)))
    .handle("reopen", ({ params }) => serve(Trips.reopen(params.tripId)))
    .handle("delete", ({ params }) => serve(Trips.remove(params.tripId))),
);

export const layer = HttpApiBuilder.layer(StacksApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide([health, groups, invites, guests, venues, sessions, ledger, stakes, trips]),
);

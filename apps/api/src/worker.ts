import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/http/Etag";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";

import * as AppleSignIn from "./auth/AppleSignIn.ts";
import * as Clerk from "./auth/Clerk.ts";
import * as ClerkAdmin from "./auth/ClerkAdmin.ts";
import * as Database from "./db/Database.ts";
import * as Account from "./features/Account.ts";
import * as Realtime from "./features/Realtime.ts";
import * as Api from "./http/Api.ts";
import * as Links from "./links/Links.ts";
import { ScopeChannel } from "./realtime/ScopeChannel.ts";
import * as Upgrade from "./realtime/Upgrade.ts";

export { ScopeChannel };

const layerWorkerPlatform = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
  Path.layer,
  Etag.layerWeak,
);

const layerOutside = Layer.mergeAll(ClerkAdmin.layer, AppleSignIn.layer).pipe(
  Layer.provide(FetchHttpClient.layer),
);

const { handler } = HttpRouter.toWebHandler(
  Layer.mergeAll(Api.layer, HttpRouter.cors()).pipe(
    Layer.provide([Clerk.layer, Clerk.layerAccount, Clerk.layerRecording, layerWorkerPlatform]),
  ),
);

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
  readonly SCOPE_CHANNEL: DurableObjectNamespace<ScopeChannel>;
  readonly LINK_SITES?: ReadonlyArray<Links.LinkSite>;
}

const handleRequest = (request: Request, env: Env, ctx: ExecutionContext) =>
  Realtime.withRealtime(
    {
      notify: (notice) => env.SCOPE_CHANNEL.getByName(notice.scope).notify(notice),
      close: ({ scope, selector, code }) =>
        env.SCOPE_CHANNEL.getByName(scope).close(selector, code),
      waitUntil: (work) => ctx.waitUntil(work),
    },
    Realtime.originOf(request.headers),
    (realtime) =>
      Effect.gen(function* () {
        const database = yield* Layer.build(Database.layer(env.HYPERDRIVE.connectionString));
        const outside = yield* Layer.build(layerOutside);

        if (Upgrade.isUpgradePath(request.url)) {
          return yield* Upgrade.upgrade(request, {
            verify: yield* Clerk.makeVerify,
            connect: (scope, upgrading) => env.SCOPE_CHANNEL.getByName(scope).fetch(upgrading),
          }).pipe(Effect.provide(database));
        }

        return yield* Effect.promise(() =>
          handler(
            request,
            Context.add(Context.merge(database, outside), Realtime.Realtime, realtime),
          ),
        );
      }).pipe(Effect.scoped),
  ).pipe(
    Effect.catchCause((cause) =>
      Effect.as(
        Effect.logError("Request failed before reaching the API", cause),
        new Response("Service unavailable", { status: 503 }),
      ),
    ),
  );

const retryClerkDeletions = (env: Env) =>
  Effect.gen(function* () {
    const database = yield* Layer.build(Database.layer(env.HYPERDRIVE.connectionString));

    return yield* Account.retryClerkDeletions().pipe(Effect.provide(database));
  }).pipe(
    Effect.provide(ClerkAdmin.layer.pipe(Layer.provide(FetchHttpClient.layer))),
    Effect.scoped,
    Effect.tap((report) => Effect.logInfo("Retried Clerk deletions", report)),
    Effect.catchCause((cause) => Effect.logError("Retrying Clerk deletions failed", cause)),
  );

export default {
  fetch: async (request, env, ctx) =>
    Links.respond(request, env.LINK_SITES) ??
    (await Effect.runPromise(handleRequest(request, env, ctx))),
  scheduled: (_controller, env, ctx) => ctx.waitUntil(Effect.runPromise(retryClerkDeletions(env))),
} satisfies ExportedHandler<Env>;

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";

import * as Clerk from "./auth/Clerk.ts";
import * as Database from "./db/Database.ts";
import * as Api from "./http/Api.ts";

// Workers have no filesystem; the API never serves files.
const layerWorkerPlatform = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
  Path.layer,
  Etag.layerWeak,
);

const { handler } = HttpRouter.toWebHandler(
  Layer.mergeAll(Api.layer, HttpRouter.cors()).pipe(
    Layer.provide([Clerk.layer, layerWorkerPlatform]),
  ),
);

/**
 * A Worker can't reuse a socket opened during another request, so each request gets its own
 * database client. Hyperdrive keeps the real Postgres connections pooled behind it.
 */
const handleRequest = (request: Request) =>
  Effect.gen(function* () {
    const database = yield* Layer.build(Database.layerConfig);
    return yield* Effect.promise(() => handler(request, database));
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.as(
        Effect.logError("Request failed before reaching the API", cause),
        new Response("Service unavailable", { status: 503 }),
      ),
    ),
  );

export default {
  fetch: (request) => Effect.runPromise(handleRequest(request)),
} satisfies ExportedHandler;

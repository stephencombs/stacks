import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PgMigrator from "@effect/sql-pg/PgMigrator";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Etag from "effect/http/Etag";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as SqlClient from "effect/sql/SqlClient";
import { Authentication, CurrentUser, StacksApi, UserId } from "@stacks/contracts";

import * as Database from "../db/Database.ts";
import { migrations } from "../db/migrations/index.ts";
import * as Api from "../http/Api.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test";

/** Tests sign in as `user_<name>`; the bearer token is the user ID. */
const layerTestAuthentication = Layer.succeed(Authentication, {
  bearer: (httpEffect, { credential }) => {
    const userId = UserId.make(Redacted.value(credential));
    return Effect.provideService(httpEffect, CurrentUser, {
      userId,
      displayName: userId.replace(/^user_/, ""),
      avatarUrl: null,
    });
  },
});

const layerPlatform = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
  Path.layer,
  Etag.layerWeak,
);

const makeTestApi = Effect.gen(function* () {
  yield* PgMigrator.run({ loader: migrations });
  const database = yield* Effect.context<SqlClient.SqlClient>();
  const { handler, dispose } = HttpRouter.toWebHandler(
    Api.layer.pipe(Layer.provide([layerTestAuthentication, layerPlatform])),
  );
  yield* Effect.addFinalizer(() => Effect.promise(dispose));
  const fetch: typeof globalThis.fetch = (input, init) =>
    handler(new Request(input, init), database);

  /** A typed API client signed in as the given user. */
  const as = (user: string) =>
    HttpApiClient.make(StacksApi, {
      baseUrl: "http://stacks.test",
      transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(`user_${user}`)),
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );
  return { as };
});

export class TestApi extends Context.Service<TestApi, Effect.Success<typeof makeTestApi>>()(
  "@stacks/api/TestApi",
) {
  static readonly layer = Layer.effect(TestApi, makeTestApi).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(Database.layer(TEST_DATABASE_URL)),
  );
}

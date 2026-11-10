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
import {
  Authentication,
  CurrentUser,
  Recorder,
  RecordingAuthentication,
  StacksApi,
  Unauthorized,
  UserId,
} from "@stacks/contracts";

import { parseActor } from "../auth/Clerk.ts";

import * as Database from "../db/Database.ts";
import { migrations } from "../db/migrations/index.ts";
import * as Api from "../http/Api.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test";

/** Tests sign in as `user_<name>`; the bearer token is the user ID. */
const testUser = (credential: Redacted.Redacted) => {
  const userId = UserId.make(Redacted.value(credential));
  return { userId, displayName: userId.replace(/^user_/, ""), avatarUrl: null };
};
const layerTestAuthentication = Layer.mergeAll(
  Layer.succeed(Authentication, {
    bearer: (httpEffect, { credential }) =>
      Effect.provideService(httpEffect, CurrentUser, testUser(credential)),
  }),
  Layer.succeed(RecordingAuthentication, {
    // Without a bearer token, fail like Clerk does so the actor scheme gets its turn.
    bearer: (httpEffect, { credential }) =>
      Redacted.value(credential) === ""
        ? Effect.fail(new Unauthorized())
        : Effect.provideService(httpEffect, Recorder, {
            _tag: "Account",
            user: testUser(credential),
          }),
    actor: (httpEffect, { credential }) =>
      Effect.flatMap(parseActor(credential), (actor) =>
        Effect.provideService(httpEffect, Recorder, { _tag: "Actor", ...actor }),
      ),
  }),
);

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
  /** A typed API client that sends `Authorization: Actor <id>.<secret>`, or nothing. */
  const asActor = (credential: { readonly actorId: string; readonly secret: string } | null) =>
    HttpApiClient.make(StacksApi, {
      baseUrl: "http://stacks.test",
      transformClient: HttpClient.mapRequest((request) =>
        credential
          ? HttpClientRequest.setHeader(
              request,
              "authorization",
              `Actor ${credential.actorId}.${credential.secret}`,
            )
          : request,
      ),
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );
  return { as, asActor };
});

export class TestApi extends Context.Service<TestApi, Effect.Success<typeof makeTestApi>>()(
  "@stacks/api/TestApi",
) {
  static readonly layer = Layer.effect(TestApi, makeTestApi).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(Database.layer(TEST_DATABASE_URL)),
  );
}

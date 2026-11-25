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
  AccountAuthentication,
  Authentication,
  CurrentUser,
  Recorder,
  RecorderOf,
  RecordingAuthentication,
  ORIGIN_HEADER,
  REALTIME_PREFIX,
  StacksApi,
  TAGS_HEADER,
  Unauthorized,
  UserId,
  type ScopeId,
  type ScopeNotice,
} from "@stacks/contracts";

import { AppleRevokeFailed, AppleSignIn } from "../auth/AppleSignIn.ts";
import { parseActor } from "../auth/Clerk.ts";
import { ClerkAdmin, ClerkUnavailable } from "../auth/ClerkAdmin.ts";

import * as Database from "../db/Database.ts";
import { migrations } from "../db/migrations/index.ts";
import * as Account from "../features/Account.ts";
import * as AccountFence from "../features/AccountFence.ts";
import * as Realtime from "../features/Realtime.ts";
import * as Api from "../http/Api.ts";
import { readTags } from "../realtime/Selector.ts";
import * as Upgrade from "../realtime/Upgrade.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stacks_test";

const testUser = (credential: Redacted.Redacted) => {
  const userId = UserId.make(Redacted.value(credential));

  return { userId, displayName: userId.replace(/^user_/, ""), avatarUrl: null };
};

const verifyTestToken: Upgrade.Upgrade["verify"] = (credential) =>
  Redacted.value(credential) === ""
    ? Effect.fail(new Unauthorized())
    : Effect.succeed(testUser(credential));

const verifyTest: Upgrade.Upgrade["verify"] = (credential) =>
  Effect.tap(verifyTestToken(credential), (user) => AccountFence.rejectInRequest(user.userId));

interface Outside {
  clerkDown: boolean;
  appleDown: boolean;
  readonly clerkAttempts: Map<string, number>;
  readonly clerkFailing: Set<string>;
  readonly clerkDeleted: Array<string>;
  readonly appleLinked: Set<string>;
  readonly appleRevoked: Array<string>;
}

const outside: Outside = {
  clerkDown: false,
  appleDown: false,
  clerkAttempts: new Map(),
  clerkFailing: new Set(),
  clerkDeleted: [],
  appleLinked: new Set(),
  appleRevoked: [],
};

const testClerk = ClerkAdmin.of({
  deleteUser: (userId) =>
    Effect.suspend(() => {
      outside.clerkAttempts.set(userId, (outside.clerkAttempts.get(userId) ?? 0) + 1);

      return outside.clerkDown || outside.clerkFailing.has(userId)
        ? Effect.fail(new ClerkUnavailable({ status: 503 }))
        : Effect.sync(() => void outside.clerkDeleted.push(userId));
    }),
  appleLinked: (userId) => Effect.sync(() => outside.appleLinked.has(userId)),
});

const testApple = AppleSignIn.of({
  revoke: (code) =>
    Effect.suspend(() =>
      outside.appleDown
        ? Effect.fail(new AppleRevokeFailed({ step: "token" }))
        : Effect.sync(() => void outside.appleRevoked.push(code)),
    ),
});

const layerTestOutside = Layer.mergeAll(
  Layer.succeed(ClerkAdmin, testClerk),
  Layer.succeed(AppleSignIn, testApple),
);

const layerTestAuthentication = Layer.mergeAll(
  Layer.succeed(Authentication, {
    bearer: (httpEffect, { credential }) =>
      Effect.flatMap(verifyTest(credential), (user) =>
        Effect.provideService(httpEffect, CurrentUser, user),
      ),
  }),
  Layer.succeed(AccountAuthentication, {
    bearer: (httpEffect, { credential }) =>
      Effect.flatMap(verifyTestToken(credential), (user) =>
        Effect.provideService(httpEffect, CurrentUser, user),
      ),
  }),
  Layer.succeed(RecordingAuthentication, {
    bearer: (httpEffect, { credential }) =>
      Effect.flatMap(verifyTest(credential), (user) =>
        Effect.provideService(httpEffect, Recorder, RecorderOf.Account({ user })),
      ),
    actor: (httpEffect, { credential }) =>
      Effect.flatMap(parseActor(credential), (actor) =>
        Effect.provideService(httpEffect, Recorder, RecorderOf.Actor(actor)),
      ),
  }),
);

const layerPlatform = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
  Path.layer,
  Etag.layerWeak,
);

const upgradeHeaders = (request: {
  readonly token?: string | null;
  readonly authorization?: string;
  readonly websocket?: boolean;
}) => {
  const headers = new Headers();

  if (request.websocket !== false) headers.set("upgrade", "websocket");

  if (request.authorization) headers.set("authorization", request.authorization);
  else if (request.token) headers.set("authorization", `Bearer ${request.token}`);

  return headers;
};

const makeTestApi = Effect.gen(function* () {
  yield* PgMigrator.run({ loader: migrations });
  const database = yield* Effect.context<SqlClient.SqlClient>();
  const requestContext = Context.merge(database, yield* Layer.build(layerTestOutside));

  const { handler, dispose } = HttpRouter.toWebHandler(
    Api.layer.pipe(Layer.provide([layerTestAuthentication, layerPlatform])),
  );

  yield* Effect.addFinalizer(() => Effect.promise(dispose));

  const sent: Array<ScopeNotice> = [];
  const closing: Array<Realtime.Close> = [];
  const flushing = new Set<Promise<unknown>>();
  let refusing = false;

  const dispatch: Realtime.Dispatch = {
    notify: async (notice) => {
      if (refusing) throw new Error("channel unavailable");
      sent.push(notice);
    },
    close: async (close) => {
      if (refusing) throw new Error("channel unavailable");
      closing.push(close);
    },
    waitUntil: (work) => void flushing.add(work),
  };

  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input, init);

    return Effect.runPromise(
      Realtime.withRealtime(dispatch, Realtime.originOf(request.headers), (realtime) =>
        Effect.promise(() =>
          handler(request, Context.add(requestContext, Realtime.Realtime, realtime)),
        ),
      ),
    );
  };

  const settled = Effect.promise(async () => {
    await Promise.all(flushing);
    flushing.clear();
  });

  const noticed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      sent.length = 0;
      yield* effect;
      yield* settled;

      return [...sent];
    });

  const notified = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.map(noticed(effect), (notices) =>
      Array.from(new Set(notices.map(({ scope }) => scope))),
    );

  const closes = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      closing.length = 0;
      yield* effect;
      yield* settled;

      return [...closing];
    });

  const refuseNotices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.sync(() => void (refusing = true)),
      () => Effect.andThen(effect, settled),
      () => Effect.sync(() => void (refusing = false)),
    );

  const forwarded: Array<ScopeId> = [];
  const forwardedTags: Array<ReadonlyArray<string>> = [];

  const upgrade = (
    path: string,
    request: {
      readonly token?: string | null;
      readonly authorization?: string;
      readonly websocket?: boolean;
      readonly method?: string;
    },
    verify: Upgrade.Upgrade["verify"] = verifyTest,
  ) =>
    Upgrade.upgrade(
      new Request(`http://stacks.test${REALTIME_PREFIX}${path}`, {
        method: request.method ?? "GET",
        headers: upgradeHeaders(request),
      }),
      {
        verify,
        connect: async (scope, forwarding) => {
          forwarded.push(scope);
          forwardedTags.push(readTags(forwarding.headers.get(TAGS_HEADER)));

          return new Response("forwarded", { status: 200 });
        },
      },
    ).pipe(Effect.provide(database));

  const named = (origin: string | null) =>
    HttpClient.mapRequest((request) =>
      origin ? HttpClientRequest.setHeader(request, ORIGIN_HEADER, origin) : request,
    );

  const as = (user: string, origin: string | null = null) =>
    HttpApiClient.make(StacksApi, {
      baseUrl: "http://stacks.test",
      transformClient: (client) =>
        named(origin)(HttpClient.mapRequest(HttpClientRequest.bearerToken(`user_${user}`))(client)),
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );

  const asActor = (
    credential: { readonly actorId: string; readonly secret: string } | null,
    origin: string | null = null,
  ) =>
    HttpApiClient.make(StacksApi, {
      baseUrl: "http://stacks.test",
      transformClient: (client) =>
        named(origin)(
          HttpClient.mapRequest((request) =>
            credential
              ? HttpClientRequest.setHeader(
                  request,
                  "authorization",
                  `Actor ${credential.actorId}.${credential.secret}`,
                )
              : request,
          )(client),
        ),
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );

  const whileClerkDown = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.sync(() => void (outside.clerkDown = true)),
      () => effect,
      () => Effect.sync(() => void (outside.clerkDown = false)),
    );

  const whileAppleDown = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.sync(() => void (outside.appleDown = true)),
      () => effect,
      () => Effect.sync(() => void (outside.appleDown = false)),
    );

  const withOutside = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(ClerkAdmin, testClerk),
      Effect.provideService(AppleSignIn, testApple),
    );

  const retryClerkDeletions = withOutside(Account.retryClerkDeletions()).pipe(
    Effect.provide(database),
  );

  return {
    as,
    asActor,
    outside,
    withOutside,
    whileClerkDown,
    whileAppleDown,
    retryClerkDeletions,
    notified,
    noticed,
    closes,
    refuseNotices,
    upgrade,
    forwarded,
    forwardedTags,
  };
});

export class TestApi extends Context.Service<TestApi, Effect.Success<typeof makeTestApi>>()(
  "@stacks/api/TestApi",
) {
  static readonly layer = Layer.effect(TestApi, makeTestApi).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(Database.layer(TEST_DATABASE_URL)),
  );
}

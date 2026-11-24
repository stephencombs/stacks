import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as ClerkAdmin from "./ClerkAdmin.ts";

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
}

const clerkAnswering = (status: number, body: string | null = null) => {
  const seen: Array<Seen> = [];

  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      seen.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
      });

      return HttpClientResponse.fromWeb(request, new Response(body, { status }));
    }),
  );

  const layer = ClerkAdmin.layer.pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ CLERK_SECRET_KEY: "sk_test_secret" })),
    ),
  );

  return { seen, layer };
};

const run = <A, E>(
  answering: ReturnType<typeof clerkAnswering>,
  use: (admin: ClerkAdmin.ClerkAdmin["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    return yield* use(yield* ClerkAdmin.ClerkAdmin);
  }).pipe(Effect.provide(answering.layer));

it.effect("deletes the user with the secret key", () =>
  Effect.gen(function* () {
    const clerk = clerkAnswering(200, JSON.stringify({ deleted: true }));
    yield* run(clerk, (admin) => admin.deleteUser("user_a/b"));

    expect(clerk.seen).toEqual([
      {
        method: "DELETE",
        url: "https://api.clerk.com/v1/users/user_a%2Fb",
        authorization: "Bearer sk_test_secret",
      },
    ]);
  }),
);

it.effect("treats a user Clerk no longer has as deleted", () =>
  Effect.gen(function* () {
    yield* run(clerkAnswering(404), (admin) => admin.deleteUser("user_gone"));
  }),
);

it.effect("fails when Clerk refuses or is down, so the deletion stays pending", () =>
  Effect.gen(function* () {
    const refused = yield* Effect.flip(
      run(clerkAnswering(503), (admin) => admin.deleteUser("user_a")),
    );

    expect(refused).toBeInstanceOf(ClerkAdmin.ClerkUnavailable);
    expect(refused).toMatchObject({ status: 503 });

    const unauthorized = yield* Effect.flip(
      run(clerkAnswering(401), (admin) => admin.deleteUser("user_a")),
    );

    expect(unauthorized).toMatchObject({ status: 401 });
  }),
);

it.effect("fails without a secret key", () =>
  Effect.gen(function* () {
    const clerk = clerkAnswering(200);

    const keyless = ClerkAdmin.layer.pipe(
      Layer.provide(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.never),
        ),
      ),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
    );

    const failed = yield* Effect.flip(
      Effect.gen(function* () {
        yield* (yield* ClerkAdmin.ClerkAdmin).deleteUser("user_a");
      }).pipe(Effect.provide(keyless)),
    );

    expect(failed).toBeInstanceOf(ClerkAdmin.ClerkUnavailable);
    expect(failed).toMatchObject({ status: null });
    expect(clerk.seen).toEqual([]);
  }),
);

it.effect("sees whether Apple is linked", () =>
  Effect.gen(function* () {
    const linked = clerkAnswering(
      200,
      JSON.stringify({ external_accounts: [{ provider: "oauth_apple" }] }),
    );

    expect(yield* run(linked, (admin) => admin.appleLinked("user_a"))).toBe(true);
    expect(linked.seen[0]!.method).toBe("GET");

    const google = clerkAnswering(
      200,
      JSON.stringify({ external_accounts: [{ provider: "oauth_google" }] }),
    );

    expect(yield* run(google, (admin) => admin.appleLinked("user_a"))).toBe(false);

    expect(yield* run(clerkAnswering(404), (admin) => admin.appleLinked("user_a"))).toBe(false);
    expect(
      (yield* Effect.flip(run(clerkAnswering(500), (admin) => admin.appleLinked("u"))))._tag,
    ).toBe("ClerkUnavailable");
  }),
);

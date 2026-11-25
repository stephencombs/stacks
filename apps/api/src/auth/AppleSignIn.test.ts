import { generateKeyPairSync, verify } from "node:crypto";

import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as TestClock from "effect/testing/TestClock";

import * as AppleSignIn from "./AppleSignIn.ts";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const settings = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: pem.replaceAll("\n", "\\n"),
  APPLE_CLIENT_ID: "com.example.colorup",
};

interface Seen {
  readonly url: string;
  readonly form: URLSearchParams;
}

const appleAnswering = (answers: Record<string, { status: number; body: object }>) => {
  const seen: Array<Seen> = [];

  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const bytes = Predicate.isTagged(request.body, "Uint8Array") ? request.body.body : null;
      seen.push({
        url: request.url,
        form: new URLSearchParams(bytes === null ? "" : new TextDecoder().decode(bytes)),
      });
      const answer = answers[new URL(request.url).pathname] ?? { status: 404, body: {} };

      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(answer.body), { status: answer.status }),
      );
    }),
  );

  const layerFor = (config: Record<string, string>) =>
    AppleSignIn.layer.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
    );

  return { seen, layerFor };
};

const revoke = (
  apple: ReturnType<typeof appleAnswering>,
  config: Record<string, string>,
  code: string,
) =>
  Effect.gen(function* () {
    const service = yield* AppleSignIn.AppleSignIn;

    yield* service.revoke(code);
  }).pipe(Effect.provide(apple.layerFor(config)));

const accepted = {
  "/auth/token": { status: 200, body: { refresh_token: "refresh-1", access_token: "access-1" } },
  "/auth/revoke": { status: 200, body: {} },
};

it.effect("signs the client secret as the team's key, with Apple's claims", () =>
  Effect.gen(function* () {
    const secret = yield* AppleSignIn.clientSecret(
      "TEAM123456",
      "KEY1234567",
      pem,
      "com.example.app",
    );

    const [head, body, signature] = secret.split(".");

    expect(JSON.parse(Buffer.from(head!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    expect(claims).toMatchObject({
      iss: "TEAM123456",
      aud: "https://appleid.apple.com",
      sub: "com.example.app",
    });
    expect(claims.exp - claims.iat).toBe(300);
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  }),
);

it.effect("exchanges the authorization code, then revokes what it granted", () =>
  Effect.gen(function* () {
    const apple = appleAnswering(accepted);
    yield* revoke(apple, settings, "code-from-the-sheet");

    expect(apple.seen.map((call) => new URL(call.url).pathname)).toEqual([
      "/auth/token",
      "/auth/revoke",
    ]);
    const [token, revocation] = apple.seen;
    expect(token!.form.get("code")).toBe("code-from-the-sheet");
    expect(token!.form.get("grant_type")).toBe("authorization_code");
    expect(token!.form.get("client_id")).toBe("com.example.colorup");
    expect(token!.form.get("client_secret")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(revocation!.form.get("token")).toBe("refresh-1");
    expect(revocation!.form.get("token_type_hint")).toBe("refresh_token");
    expect(revocation!.form.get("client_id")).toBe("com.example.colorup");
  }),
);

it.effect("fails at the step Apple refuses, and without configuration", () =>
  Effect.gen(function* () {
    const spent = appleAnswering({ ...accepted, "/auth/token": { status: 400, body: {} } });
    expect(yield* Effect.flip(revoke(spent, settings, "used"))).toMatchObject({ step: "token" });
    expect(spent.seen).toHaveLength(1);

    const stuck = appleAnswering({ ...accepted, "/auth/revoke": { status: 500, body: {} } });
    expect(yield* Effect.flip(revoke(stuck, settings, "code"))).toMatchObject({ step: "revoke" });

    const unconfigured = appleAnswering(accepted);
    expect(yield* Effect.flip(revoke(unconfigured, {}, "code"))).toMatchObject({
      step: "configure",
    });
    expect(unconfigured.seen).toEqual([]);

    const badKey = appleAnswering(accepted);

    expect(
      yield* Effect.flip(revoke(badKey, { ...settings, APPLE_PRIVATE_KEY: "not a key" }, "code")),
    ).toMatchObject({ step: "sign" });
  }),
);

it.effect("gives up on an Apple that never answers", () =>
  Effect.gen(function* () {
    const asked = yield* Deferred.make<void>();

    const silent = AppleSignIn.layer.pipe(
      Layer.provide(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.andThen(Deferred.succeed(asked, undefined), Effect.never)),
        ),
      ),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(settings))),
    );

    const revoking = yield* Effect.forkChild(
      Effect.flip(
        Effect.gen(function* () {
          yield* (yield* AppleSignIn.AppleSignIn).revoke("code");
        }).pipe(Effect.provide(silent)),
      ),
    );

    yield* Deferred.await(asked);
    yield* TestClock.adjust("11 seconds");
    expect(yield* Fiber.join(revoking)).toMatchObject({ step: "token" });
  }),
);

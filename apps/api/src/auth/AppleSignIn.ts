import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

/** Apple wasn't reachable, refused the code, or isn't configured. */
export class AppleRevokeFailed extends Data.TaggedError("AppleRevokeFailed")<{
  readonly step: "configure" | "sign" | "token" | "revoke";
}> {}

/** Takes back the access an app got through Sign in with Apple. */
export class AppleSignIn extends Context.Service<
  AppleSignIn,
  {
    /** Exchanges the authorization code the Apple sheet returned, then revokes what it granted. */
    readonly revoke: (authorizationCode: string) => Effect.Effect<void, AppleRevokeFailed>;
  }
>()("@stacks/api/AppleSignIn") {}

const APPLE_URL = "https://appleid.apple.com";

const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

const jsonPart = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

const TokenResponse = Schema.Struct({ refresh_token: Schema.String });

/**
 * Apple's client secret: a short ES256 token signed with the team's key. WebCrypto already signs
 * as the raw `r || s` pair JWS wants.
 */
export const clientSecret = Effect.fn("AppleSignIn.clientSecret")(function* (
  teamId: string,
  keyId: string,
  privateKey: string,
  clientId: string,
) {
  const issuedAt = Math.floor(DateTime.toEpochMillis(yield* DateTime.now) / 1000);

  const body = `${jsonPart({ alg: "ES256", kid: keyId })}.${jsonPart({
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: APPLE_URL,
    sub: clientId,
  })}`;

  const pem = privateKey.replaceAll("\\n", "\n").replaceAll(/-----[A-Z ]+-----|\s/g, "");

  return yield* Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "pkcs8",
        Buffer.from(pem, "base64"),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );

      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        new TextEncoder().encode(body),
      );

      return `${body}.${base64Url(new Uint8Array(signature))}`;
    },
    catch: () => new AppleRevokeFailed({ step: "sign" }),
  });
});

export const layer = Layer.effect(
  AppleSignIn,
  Effect.gen(function* () {
    const teamId = yield* Config.option(Config.String("APPLE_TEAM_ID"));
    const keyId = yield* Config.option(Config.String("APPLE_KEY_ID"));
    const privateKey = yield* Config.option(Config.Redacted("APPLE_PRIVATE_KEY"));
    const clientId = yield* Config.option(Config.String("APPLE_CLIENT_ID"));
    const client = yield* HttpClient.HttpClient;

    const form = Effect.fn("AppleSignIn.form")(function* (
      path: "token" | "revoke",
      fields: Record<string, string>,
    ) {
      const response = yield* client
        .execute(
          HttpClientRequest.post(`${APPLE_URL}/auth/${path}`).pipe(
            HttpClientRequest.bodyUrlParams(fields),
          ),
        )
        .pipe(Effect.mapError(() => new AppleRevokeFailed({ step: path })));

      if (response.status < 200 || response.status >= 300)
        return yield* new AppleRevokeFailed({ step: path });

      return response;
    });

    return AppleSignIn.of({
      revoke: Effect.fn("AppleSignIn.revoke")(function* (authorizationCode) {
        if (
          Option.isNone(teamId) ||
          Option.isNone(keyId) ||
          Option.isNone(privateKey) ||
          Option.isNone(clientId)
        )
          return yield* new AppleRevokeFailed({ step: "configure" });

        const secret = yield* clientSecret(
          teamId.value,
          keyId.value,
          Redacted.value(privateKey.value),
          clientId.value,
        );

        const granted = yield* (yield* form("token", {
          client_id: clientId.value,
          client_secret: secret,
          code: authorizationCode,
          grant_type: "authorization_code",
        })).json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(TokenResponse)),
          Effect.mapError(() => new AppleRevokeFailed({ step: "token" })),
        );

        yield* form("revoke", {
          client_id: clientId.value,
          client_secret: secret,
          token: granted.refresh_token,
          token_type_hint: "refresh_token",
        });
      }),
    });
  }),
);

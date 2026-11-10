import { verifyToken } from "@clerk/backend";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  Authentication,
  CurrentUser,
  Recorder,
  RecordingAuthentication,
  Unauthorized,
  UserId,
} from "@stacks/contracts";

const stringClaim = (claims: Record<string, unknown>, key: string) => {
  const value = claims[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/**
 * Whether a token's `azp` claim names a site we serve. Browser tokens name the page's origin;
 * tokens from the native app have no origin and no `azp`, and Clerk's own check refuses those.
 */
export const fromAuthorizedParty = (
  azp: string | undefined,
  authorizedParties: ReadonlyArray<string>,
) => authorizedParties.length === 0 || azp === undefined || authorizedParties.includes(azp);

/**
 * Verifies Clerk session tokens. With `CLERK_JWT_KEY` set, verification is networkless;
 * otherwise Clerk's JWKS is fetched with the secret key. Names come from the `name` and
 * `picture` claims, which the Clerk session token template has to add.
 */
const makeVerify = Effect.gen(function* () {
  const secretKey = yield* Config.option(Config.Redacted("CLERK_SECRET_KEY"));
  const jwtKey = yield* Config.option(Config.String("CLERK_JWT_KEY"));
  const authorizedParties = yield* Config.Array(Schema.String, "CLERK_AUTHORIZED_PARTIES").pipe(
    Config.withDefault([]),
  );
  return Effect.fn("Authentication.verify")(function* (credential: Redacted.Redacted) {
    const claims = yield* Effect.tryPromise(() =>
      verifyToken(Redacted.value(credential), {
        ...Option.match(secretKey, {
          onNone: () => ({}),
          onSome: (key) => ({ secretKey: Redacted.value(key) }),
        }),
        ...Option.match(jwtKey, { onNone: () => ({}), onSome: (key) => ({ jwtKey: key }) }),
      }),
    ).pipe(
      Effect.filterOrFail(
        (claims) => fromAuthorizedParty(claims.azp, authorizedParties),
        () => new Unauthorized(),
      ),
      Effect.mapError(() => new Unauthorized()),
    );
    const userId = yield* UserId.makeEffect(claims.sub).pipe(
      Effect.mapError(() => new Unauthorized()),
    );
    return CurrentUser.of({
      userId,
      displayName: stringClaim(claims, "name")?.slice(0, 60) ?? "Player",
      avatarUrl: stringClaim(claims, "picture"),
    });
  });
});

export const layer = Layer.effect(
  Authentication,
  Effect.map(makeVerify, (verify) =>
    Authentication.of({
      bearer: (httpEffect, { credential }) =>
        Effect.flatMap(verify(credential), (user) =>
          Effect.provideService(httpEffect, CurrentUser, user),
        ),
    }),
  ),
);

/** `Actor <actorId>.<secret>`: the service checks the secret against the database. */
export const parseActor = (credential: Redacted.Redacted) => {
  const value = Redacted.value(credential);
  const dot = value.indexOf(".");
  return dot > 0
    ? Effect.succeed({ actorId: value.slice(0, dot), secret: value.slice(dot + 1) })
    : Effect.fail(new Unauthorized());
};

export const layerRecording = Layer.effect(
  RecordingAuthentication,
  Effect.map(makeVerify, (verify) =>
    RecordingAuthentication.of({
      bearer: (httpEffect, { credential }) =>
        Effect.flatMap(verify(credential), (user) =>
          Effect.provideService(httpEffect, Recorder, { _tag: "Account", user }),
        ),
      actor: (httpEffect, { credential }) =>
        Effect.flatMap(parseActor(credential), (actor) =>
          Effect.provideService(httpEffect, Recorder, { _tag: "Actor", ...actor }),
        ),
    }),
  ),
);

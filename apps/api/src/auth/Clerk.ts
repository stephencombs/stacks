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
  RecorderOf,
  RecordingAuthentication,
  Unauthorized,
  UserId,
} from "@stacks/contracts";

const claimText = (decoded: Option.Option<string>) =>
  Option.match(decoded, {
    onNone: () => null,
    onSome: (value) => {
      const trimmed = value.trim();

      return trimmed === "" ? null : trimmed;
    },
  });

/** Native session tokens do not name a browser origin. */
export const isNativeSession = (azp: string | undefined) => azp === undefined;

const makeVerify = Effect.gen(function* () {
  const secretKey = yield* Config.option(Config.Redacted("CLERK_SECRET_KEY"));
  const jwtKey = yield* Config.option(Config.String("CLERK_JWT_KEY"));

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
        (claims) => isNativeSession(claims.azp),
        () => new Unauthorized(),
      ),
      Effect.mapError(() => new Unauthorized()),
    );

    const userId = yield* UserId.makeEffect(claims.sub).pipe(
      Effect.mapError(() => new Unauthorized()),
    );

    return CurrentUser.of({
      userId,
      displayName:
        claimText(Schema.decodeUnknownOption(Schema.String)(claims.name))?.slice(0, 60) ?? "Player",
      avatarUrl: claimText(Schema.decodeUnknownOption(Schema.String)(claims.picture)),
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
          Effect.provideService(httpEffect, Recorder, RecorderOf.Account({ user })),
        ),
      actor: (httpEffect, { credential }) =>
        Effect.flatMap(parseActor(credential), (actor) =>
          Effect.provideService(httpEffect, Recorder, RecorderOf.Actor(actor)),
        ),
    }),
  ),
);

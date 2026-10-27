import { verifyToken } from "@clerk/backend";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Authentication, CurrentUser, Unauthorized, UserId } from "@stacks/contracts";

const stringClaim = (claims: Record<string, unknown>, key: string) => {
  const value = claims[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/**
 * Verifies Clerk session tokens. With `CLERK_JWT_KEY` set, verification is networkless;
 * otherwise Clerk's JWKS is fetched with the secret key. Names come from the `name` and
 * `picture` claims, which the Clerk session token template has to add.
 */
export const layer = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const secretKey = yield* Config.option(Config.Redacted("CLERK_SECRET_KEY"));
    const jwtKey = yield* Config.option(Config.String("CLERK_JWT_KEY"));
    const authorizedParties = yield* Config.Array(Schema.String, "CLERK_AUTHORIZED_PARTIES").pipe(
      Config.withDefault([]),
    );

    return Authentication.of({
      bearer: Effect.fn("Authentication.bearer")(function* (httpEffect, { credential }) {
        const claims = yield* Effect.tryPromise(() =>
          verifyToken(Redacted.value(credential), {
            ...Option.match(secretKey, {
              onNone: () => ({}),
              onSome: (key) => ({ secretKey: Redacted.value(key) }),
            }),
            ...Option.match(jwtKey, { onNone: () => ({}), onSome: (key) => ({ jwtKey: key }) }),
            ...(authorizedParties.length > 0 ? { authorizedParties: [...authorizedParties] } : {}),
          }),
        ).pipe(Effect.mapError(() => new Unauthorized()));

        const userId = yield* UserId.makeEffect(claims.sub).pipe(
          Effect.mapError(() => new Unauthorized()),
        );
        return yield* Effect.provideService(httpEffect, CurrentUser, {
          userId,
          displayName: stringClaim(claims, "name")?.slice(0, 60) ?? "Player",
          avatarUrl: stringClaim(claims, "picture"),
        });
      }),
    });
  }),
);

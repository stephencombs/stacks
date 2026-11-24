import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

/** Clerk didn't answer, or refused. `status` is null when no answer came. */
export class ClerkUnavailable extends Data.TaggedError("ClerkUnavailable")<{
  readonly status: number | null;
}> {}

/** What the API asks of Clerk's backend, apart from checking a session token. */
export class ClerkAdmin extends Context.Service<
  ClerkAdmin,
  {
    /** Deletes the user. A user Clerk no longer has counts as deleted. */
    readonly deleteUser: (userId: string) => Effect.Effect<void, ClerkUnavailable>;
    readonly appleLinked: (userId: string) => Effect.Effect<boolean, ClerkUnavailable>;
  }
>()("@stacks/api/ClerkAdmin") {}

const USERS_URL = "https://api.clerk.com/v1/users";

const ClerkUser = Schema.Struct({
  external_accounts: Schema.Array(Schema.Struct({ provider: Schema.String })),
});

export const layer = Layer.effect(
  ClerkAdmin,
  Effect.gen(function* () {
    const secretKey = yield* Config.option(Config.Redacted("CLERK_SECRET_KEY"));
    const client = yield* HttpClient.HttpClient;

    const call = Effect.fn("ClerkAdmin.call")(function* (method: "GET" | "DELETE", userId: string) {
      const key = yield* Option.match(secretKey, {
        onNone: () => Effect.fail(new ClerkUnavailable({ status: null })),
        onSome: Effect.succeed,
      });

      return yield* client
        .execute(
          HttpClientRequest.make(method)(`${USERS_URL}/${encodeURIComponent(userId)}`).pipe(
            HttpClientRequest.bearerToken(Redacted.value(key)),
          ),
        )
        .pipe(
          Effect.timeout("10 seconds"),
          Effect.mapError(() => new ClerkUnavailable({ status: null })),
        );
    });

    return ClerkAdmin.of({
      deleteUser: Effect.fn("ClerkAdmin.deleteUser")(function* (userId) {
        const { status } = yield* call("DELETE", userId);

        if ((status < 200 || status >= 300) && status !== 404)
          return yield* new ClerkUnavailable({ status });
      }),
      appleLinked: Effect.fn("ClerkAdmin.appleLinked")(function* (userId) {
        const response = yield* call("GET", userId);

        if (response.status === 404) return false;

        if (response.status < 200 || response.status >= 300)
          return yield* new ClerkUnavailable({ status: response.status });

        const user = yield* response.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ClerkUser)),
          Effect.mapError(() => new ClerkUnavailable({ status: response.status })),
        );

        return user.external_accounts.some(({ provider }) => provider.endsWith("apple"));
      }),
    });
  }),
);

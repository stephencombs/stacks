import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schema from "effect/Schema";
import { Unauthorized } from "@stacks/contracts";

import { makeAccountApi, makeRecordingTransport } from "./api.ts";

const unauthorized = () =>
  Response.json(Schema.encodeSync(Schema.toCodecJson(Unauthorized))(new Unauthorized()), {
    status: 401,
  });

const capture = (respond: (request: Request, count: number) => Response) => {
  const seen: Array<Request> = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    seen.push(request);

    return respond(request, seen.length);
  };

  return { seen, fetch };
};

const account = (freshToken: () => Promise<string | null> = async () => "fresh") =>
  makeAccountApi({
    baseUrl: "https://colorup.test",
    getToken: async () => "cached",
    freshToken,
    origin: "install-1",
  });

it.effect("sends the optional Apple code to delete, and reports pending or complete", () =>
  Effect.gen(function* () {
    const { seen, fetch } = capture(() => Response.json({ status: "pending" }));
    const api = account();

    const first = yield* api
      .remove("apple-code")
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    const second = yield* api.remove().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    expect(first).toEqual({ status: "pending" });
    expect(second).toEqual({ status: "pending" });
    expect(seen.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/account/delete",
      "/api/account/delete",
    ]);
    expect(seen.map((request) => request.method)).toEqual(["POST", "POST"]);
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer cached");
    expect(yield* Effect.promise(() => seen[0]!.json())).toEqual({
      authorizationCode: "apple-code",
    });
    expect(yield* Effect.promise(() => seen[1]!.json())).toEqual({});
  }),
);

it.effect("counts a refused delete as done when a fresh token is refused too", () =>
  Effect.gen(function* () {
    const { seen, fetch } = capture(unauthorized);

    const result = yield* account()
      .remove()
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    expect(result).toEqual({ status: "complete" });
    expect(seen.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer cached",
      "Bearer fresh",
    ]);
    expect(new URL(seen[1]!.url).pathname).toBe("/api/account/deletion-preview");
  }),
);

it.effect("keeps a refused delete an error when a fresh token is accepted", () =>
  Effect.gen(function* () {
    const { fetch } = capture((request) =>
      request.method === "POST"
        ? unauthorized()
        : Response.json({
            soloGroups: [],
            ownershipMoves: [],
            openBalances: [],
            openStakes: [],
            appleLinked: false,
          }),
    );

    const error = yield* account()
      .remove()
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch), Effect.flip);

    expect(Schema.is(Unauthorized)(error)).toBe(true);
  }),
);

it.effect("doesn't call an account gone without a fresh token, or when it can't ask", () =>
  Effect.gen(function* () {
    const none = capture(unauthorized);

    expect(
      yield* account(async () => null).gone.pipe(
        Effect.provideService(FetchHttpClient.Fetch, none.fetch),
      ),
    ).toBe(false);
    expect(none.seen).toEqual([]);

    const offline: typeof globalThis.fetch = async () => {
      throw new TypeError("Network request failed");
    };

    expect(yield* account().gone.pipe(Effect.provideService(FetchHttpClient.Fetch, offline))).toBe(
      false,
    );
  }),
);

it.effect("tells the app when a request that carried the session was refused", () =>
  Effect.gen(function* () {
    const refused: Array<string> = [];

    const transport = (token: string | null) =>
      makeRecordingTransport({
        baseUrl: "https://colorup.test",
        getToken: async () => token,
        origin: "install-1",
        onUnauthorized: () => void refused.push(token ?? "none"),
      });

    const { fetch } = capture(unauthorized);

    yield* transport("session")
      .history(null)
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch), Effect.flip);

    yield* transport(null)
      .history(null)
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch), Effect.flip);

    expect(refused).toEqual(["session"]);
  }),
);

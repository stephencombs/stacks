import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schema from "effect/Schema";
import { Unauthorized } from "@stacks/contracts";

import { makeAccountApi, makeRecordingTransport } from "./api.ts";

const refusal = (reason?: "account_deleted") =>
  Response.json(
    Schema.encodeSync(Schema.toCodecJson(Unauthorized))(
      reason ? new Unauthorized({ reason }) : new Unauthorized(),
    ),
    { status: 401 },
  );

const unauthorized = () => refusal();

const capture = (respond: (request: Request, count: number) => Response) => {
  const seen: Array<Request> = [];

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    seen.push(request);

    return respond(request, seen.length);
  };

  return { seen, fetch };
};

const account = () =>
  makeAccountApi({
    baseUrl: "https://colorup.test",
    getToken: async () => "cached",
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

it.effect("asks again after a lost response and gets the deletion's state", () =>
  Effect.gen(function* () {
    const { fetch } = capture((_, count) =>
      Response.json({ status: count === 1 ? "pending" : "complete" }),
    );

    const api = account();

    const first = yield* api.remove().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));
    const second = yield* api.remove().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));

    expect(first).toEqual({ status: "pending" });
    expect(second).toEqual({ status: "complete" });
  }),
);

it.effect("keeps a bare 401 on delete an error", () =>
  Effect.gen(function* () {
    const { fetch } = capture(unauthorized);

    const error = yield* account()
      .remove()
      .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch), Effect.flip);

    expect(Schema.is(Unauthorized)(error)).toBe(true);
  }),
);

it.effect("tells the app only when the 401 says the account was deleted", () =>
  Effect.gen(function* () {
    const deleted: Array<number> = [];

    const transport = makeRecordingTransport({
      baseUrl: "https://colorup.test",
      getToken: async () => "session",
      origin: "install-1",
      onAccountDeleted: () => void deleted.push(deleted.length),
    });

    const history = (response: Response) =>
      transport.history(null).pipe(
        Effect.provideService(FetchHttpClient.Fetch, async () => response),
        Effect.flip,
      );

    const bare = yield* history(refusal());
    yield* history(new Response("not json", { status: 401 }));
    const gone = yield* history(refusal("account_deleted"));

    expect(deleted).toEqual([0]);
    expect(Schema.is(Unauthorized)(bare)).toBe(true);
    expect(Schema.is(Unauthorized)(gone)).toBe(true);
  }),
);

it.effect("tells the app from the account screens' client too", () =>
  Effect.gen(function* () {
    const deleted: Array<string> = [];

    const preview = (token: string | null) =>
      makeAccountApi({
        baseUrl: "https://colorup.test",
        getToken: async () => token,
        origin: "install-1",
        onAccountDeleted: () => void deleted.push(token ?? "none"),
      }).preview.pipe(
        Effect.provideService(FetchHttpClient.Fetch, async () => refusal("account_deleted")),
        Effect.flip,
      );

    yield* preview("session");

    expect(deleted).toEqual(["session"]);
  }),
);

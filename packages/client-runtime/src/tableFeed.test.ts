import { describe, expect, it } from "@effect/vitest";
import { PlayerId, TableId, tableScope } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import { createNoticeRefresh } from "./noticeRefresh.ts";
import { setup } from "./realtimeFake.test-utils.ts";
import { watchScopes } from "./screenNotices.ts";
import { createTableFeed, tableRefreshTarget } from "./tableFeed.ts";

const tableId = TableId.make("0192e7a0-0000-7000-8000-0000000000b1");

const viewOf = (shared: boolean) =>
  ({
    table: {
      id: tableId,
      tripId: null,
      game: null,
      venueId: null,
      highLimit: false,
      starterPlayerId: PlayerId.make("0192e7a0-0000-7000-8000-0000000000b2"),
    },
    players: [],
    visits: [],
    viewerRole: "viewer",
    viewerPlayerId: null,
    recorders: [],
    appointable: [],
    shared,
  }) satisfies TableView;

const gate = () => {
  const requests: Array<PromiseWithResolvers<TableView>> = [];

  return {
    requests,
    load: () => {
      const request = Promise.withResolvers<TableView>();
      requests.push(request);

      return request.promise;
    },
  };
};

const settle = Effect.promise(async () => {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
});

describe("table feed", () => {
  it.effect("fetches once and wakes once for a notice however many screens show the table", () =>
    Effect.gen(function* () {
      const { hub, lines, fork } = yield* setup({ origin: "this-phone" });
      const fetches = gate();
      const feed = createTableFeed(fetches.load);
      let wakes = 0;
      const refresh = createNoticeRefresh(fork);
      refresh.register(tableRefreshTarget(feed, tableId, () => void (wakes += 1)));

      const shown = [
        feed.subscribe(tableId, () => {}),
        feed.subscribe(tableId, () => {}),
        feed.subscribe(tableId, () => {}),
      ];

      expect(fetches.requests).toHaveLength(1);
      fetches.requests[0]!.resolve(viewOf(false));
      yield* settle;

      watchScopes(hub, refresh).set([tableScope(tableId)]);
      const line = yield* Queue.take(lines);
      line.handlers.open();
      yield* TestClock.adjust("200 millis");
      expect(fetches.requests).toHaveLength(2);
      expect(wakes).toBe(1);

      fetches.requests[1]!.resolve(viewOf(true));
      yield* settle;

      line.handlers.message(JSON.stringify({ scope: tableScope(tableId), origin: "this-phone" }));
      yield* TestClock.adjust("1 second");
      expect(fetches.requests).toHaveLength(2);
      expect(wakes).toBe(1);

      line.handlers.message(JSON.stringify({ scope: tableScope(tableId), origin: "that-phone" }));
      yield* TestClock.adjust("200 millis");
      expect(fetches.requests).toHaveLength(3);
      expect(wakes).toBe(2);

      for (const stop of shown) stop();
    }),
  );

  it.effect("holds what the table loaded while it's shown, null when it can't be reached", () =>
    Effect.gen(function* () {
      const fetches = gate();
      const feed = createTableFeed(fetches.load);
      const stop = feed.subscribe(tableId, () => {});
      expect(feed.view(tableId)).toBeUndefined();
      fetches.requests[0]!.resolve(viewOf(true));
      yield* settle;
      expect(feed.view(tableId)).toEqual(viewOf(true));

      feed.refresh(tableId);
      fetches.requests[1]!.reject(new Error("offline"));
      yield* settle;
      expect(feed.view(tableId)).toBeNull();

      stop();
      expect(feed.view(tableId)).toBeUndefined();
    }),
  );
});

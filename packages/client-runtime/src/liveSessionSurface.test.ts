import { VenueId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";

import { liveSessionSurface, reconcileLiveSessionSurface } from "./liveSessionSurface.ts";
import { makeRecordingStore } from "./recording.ts";
import type { RecordingStorageDocument } from "./recordingStorage.ts";

const appUrl = (path: string) => `stacks-dev://${path}`;
const utc = DateTime.zoneMakeOffset(0);

const openStore = async () => {
  let documentState: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => documentState,
    commit: async (_revision, payload) => {
      documentState = { revision: documentState.revision + 1, payload };

      return documentState.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;

  return store;
};

it("derives own live session surface while ignoring other players at a shared table", async () => {
  const store = await openStore();

  try {
    const start = DateTime.makeUnsafe("2026-11-13T21:12:00.000Z");
    await store.execute(
      store.prepare({
        type: "start",
        buyIn: 30000,
        startedAt: start,
        game: "blackjack",
        venueId: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
      }),
      [
        {
          id: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
          name: "Resorts World",
          kind: "casino",
          city: "Las Vegas",
          region: "NV",
          country: "US",
          lat: 36.1341,
          lng: -115.1665,
        },
      ],
    );
    const visit = store.getSnapshot().state!.visits[0]!;
    await store.execute(
      store.prepare({
        type: "join_table",
        tableId: visit.tableId,
        displayName: "Priya",
        buyIn: 50000,
      }),
    );

    const live = liveSessionSurface(
      store.getSnapshot().state,
      { showCents: true, privacyMode: false },
      appUrl,
    );

    expect(live.kind).toBe("live");

    if (live.kind !== "live") throw new Error("expected live");
    expect(live.visitId).toBe(visit.id);
    expect(live.gameLabel).toBe("Blackjack");
    expect(live.venueLabel).toBe("Resorts World");
    expect(live.buyIn).toBe(30000);
    expect(live.buyInText).toBe("$300.00");
    expect(live.startedAtMs).toBe(DateTime.toEpochMillis(start));
    expect(live.deepLinks.open).toBe(`stacks-dev://play/${visit.id}`);
    expect(live.deepLinks.cashOut).toBe(`stacks-dev://play/${visit.id}?action=cash_out`);

    const hidden = liveSessionSurface(
      store.getSnapshot().state,
      { showCents: true, privacyMode: true },
      appUrl,
    );

    expect(hidden.kind).toBe("live");

    if (hidden.kind !== "live") throw new Error("expected live");
    expect(hidden.buyInText).toBe("••••");
    expect(hidden.title).not.toContain("$300");
  } finally {
    await store.close();
  }
});

it("emits finished summary on cash-out and clears when deleted", async () => {
  const store = await openStore();

  try {
    const start = DateTime.makeUnsafe("2026-11-13T21:12:00.000Z");
    const end = DateTime.makeUnsafe("2026-11-13T23:00:00.000Z");
    await store.execute(
      store.prepare({ type: "start", buyIn: 40000, startedAt: start, game: "blackjack" }),
    );
    const visitId = store.getSnapshot().state!.visits[0]!.id;

    await store.execute(store.prepare({ type: "finish", visitId, amount: 45000, finishedAt: end }));

    const finished = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: true, privacyMode: false },
      appUrl,
      utc,
    );

    expect(finished.kind).toBe("finished");

    if (finished.kind !== "finished") throw new Error("expected finished");
    expect(finished.result).toBe(5000);
    expect(finished.resultText).toBe("+$50.00");
    expect(finished.durationText).toBe("1h 48m played");
    expect(finished.buyInText).toBe("$400.00");
    expect(finished.cashOutText).toBe("$450.00");
    expect(finished.hourlyText).toBe("+$27.78/hr");
    expect(finished.summaryLine).toBe("$400.00 in · $450.00 out · +$27.78/hr");
    expect(finished.finishedTimeText).toBe("Finished 11:00 PM");
    expect(finished.deepLinks.seeSession).toBe(`stacks-dev://play/${visitId}`);

    const hiddenFinished = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: false, privacyMode: true },
      appUrl,
      utc,
    );

    expect(hiddenFinished.kind).toBe("finished");

    if (hiddenFinished.kind !== "finished") throw new Error("expected finished");
    expect(hiddenFinished.resultText).toBe("••••");
    expect(hiddenFinished.summaryLine).toBe("Amounts hidden");

    await store.execute(store.prepare({ type: "delete_visit", visitId }));

    const deleted = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: false, privacyMode: false },
      appUrl,
    );

    expect(deleted.kind).toBe("idle");
  } finally {
    await store.close();
  }
});

it("suppresses hourly rate for sub-minute finished sessions", async () => {
  const store = await openStore();

  try {
    const start = DateTime.makeUnsafe("2026-11-13T21:12:00.000Z");
    const end = DateTime.add(start, { seconds: 42 });

    await store.execute(
      store.prepare({ type: "start", buyIn: 20000, startedAt: start, game: "blackjack" }),
    );
    const visitId = store.getSnapshot().state!.visits[0]!.id;

    await store.execute(store.prepare({ type: "finish", visitId, amount: 35000, finishedAt: end }));

    const finished = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: true, privacyMode: false },
      appUrl,
      utc,
    );

    expect(finished.kind).toBe("finished");

    if (finished.kind !== "finished") throw new Error("expected finished");
    expect(finished.hourlyText).toBe("");
    expect(finished.summaryLine).toBe("$200.00 in · $350.00 out");

    const hiddenFinished = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: true, privacyMode: true },
      appUrl,
      utc,
    );

    expect(hiddenFinished.kind).toBe("finished");

    if (hiddenFinished.kind !== "finished") throw new Error("expected finished");
    expect(hiddenFinished.hourlyText).toBe("");
    expect(hiddenFinished.summaryLine).toBe("Amounts hidden");
  } finally {
    await store.close();
  }
});

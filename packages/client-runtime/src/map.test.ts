import { TripId, VenueId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";

import { personalMapView } from "./map.ts";
import { makeRecordingStore, type CachedVenue } from "./recording.ts";
import type { RecordingStorageDocument } from "./recordingStorage.ts";
import { recordingHome } from "./recordingView.ts";

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

const wynn: CachedVenue = {
  id: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
  name: "Wynn Las Vegas",
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat: 36.1265,
  lng: -115.1656,
};

const bellagio: CachedVenue = {
  id: VenueId.make("0192e7a0-0000-7000-8000-000000000002"),
  name: "Bellagio",
  kind: "casino",
  city: "Las Vegas",
  region: "NV",
  country: "US",
  lat: 36.1129,
  lng: -115.1765,
};

it("returns empty before any finished session", async () => {
  const store = await openStore();

  try {
    const view = personalMapView(recordingHome(store.getSnapshot().state!), new Map(), utc);
    expect(view.kind).toBe("empty");
  } finally {
    await store.close();
  }
});

it("shapes pins, day paths, venue detail sheets and unmapped counts offline", async () => {
  const store = await openStore();

  try {
    const tripId = TripId.make("0192e7a0-0000-7000-8000-000000000301");
    await store.execute(
      store.prepare({
        type: "record_completed",
        buyIn: 20000,
        cashOut: 34500,
        startedAt: DateTime.makeUnsafe("2026-11-07T20:00:00Z"),
        finishedAt: DateTime.makeUnsafe("2026-11-07T22:10:00Z"),
        game: "craps",
        venueId: wynn.id,
      }),
      [wynn],
    );
    const t1 = store.getSnapshot().state!.tables[0]!.id;
    await store.execute(store.prepare({ type: "set_table_trip", tableId: t1, tripId }));

    await store.execute(
      store.prepare({
        type: "record_completed",
        buyIn: 30000,
        cashOut: 18000,
        startedAt: DateTime.makeUnsafe("2026-11-07T23:00:00Z"),
        finishedAt: DateTime.makeUnsafe("2026-11-08T01:00:00Z"),
        game: "blackjack",
        venueId: bellagio.id,
      }),
      [bellagio],
    );

    await store.execute(
      store.prepare({
        type: "record_completed",
        buyIn: 10000,
        cashOut: 15000,
        startedAt: DateTime.makeUnsafe("2026-11-06T20:00:00Z"),
        finishedAt: DateTime.makeUnsafe("2026-11-06T21:00:00Z"),
        game: "slots",
      }),
    );

    const home = recordingHome(store.getSnapshot().state!);
    const trips = new Map([[tripId, "Vegas Weekend"]]);
    const allView = personalMapView(home, trips, utc, { kind: "all" });
    expect(allView.kind).toBe("map");

    if (allView.kind !== "map") throw new Error("expected map");

    expect(allView.pins).toHaveLength(2);
    expect(allView.noLocationLine).toBe("1 session has no saved location");
    expect(allView.stops).toHaveLength(0);
    expect(allView.summaryCard).toBeNull();

    const wynnSheet = allView.venueSheet(wynn.id)!;
    expect(wynnSheet.name).toBe("Wynn Las Vegas");
    expect(wynnSheet.subtitle).toBe("Las Vegas, NV · 1 session · 2h 10m");
    expect(wynnSheet.result).toBe(14500);
    expect(wynnSheet.visits[0]).toMatchObject({
      title: "Craps",
      gameChip: "red",
      result: 14500,
    });
    expect(wynnSheet.visits[0]!.meta).toContain("Vegas Weekend");

    const dayView = personalMapView(home, trips, utc, { kind: "day", dayKey: "2026-11-07" });

    if (dayView.kind !== "map") throw new Error("expected map");
    expect(dayView.filterLabel).toBe("Vegas Weekend · Saturday");
    expect(dayView.stops).toHaveLength(2);
    expect(dayView.path).toHaveLength(2);
    expect(dayView.summaryCard).toMatchObject({
      title: "Saturday · 2 casinos",
      result: 2500,
    });
    expect(dayView.summaryCard!.subtitle).toContain("in the order you played");
    expect(dayView.noLocationLine).toBeNull();
  } finally {
    await store.close();
  }
});

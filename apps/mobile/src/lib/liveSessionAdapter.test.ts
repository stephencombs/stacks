// @vitest-environment happy-dom
import { reconcileLiveSessionSurface } from "@stacks/client-runtime/liveSessionSurface";
import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import * as DateTime from "effect/DateTime";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const bridge = vi.hoisted(() => ({
  store: undefined as ReturnType<typeof makeRecordingStore> | undefined,
  privacyMode: false,
  showLive: vi.fn(async () => {}),
  showFinished: vi.fn<(payload: { resultText: string }) => Promise<void>>(async () => {}),
  clear: vi.fn(async () => {}),
}));

vi.stubGlobal("__DEV__", false);
vi.mock("../../modules/live-session-updates/src", () => ({
  liveSessionUpdates: bridge,
}));
vi.mock("react-native", () => ({
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
    RESULTS: { GRANTED: "granted" },
    request: async () => "granted",
  },
  Platform: { OS: "android", Version: 37 },
}));
vi.mock("./config", () => ({
  appUrl: (path: string) => `stacks-dev://${path}`,
}));
vi.mock("./preferences", () => ({
  usePreferences: () => ({ showCents: false, privacyMode: bridge.privacyMode }),
}));
vi.mock("./recording", () => ({
  recordingStore: {
    subscribe: (listener: () => void) => bridge.store!.subscribe(listener),
    getSnapshot: () => bridge.store!.getSnapshot(),
  },
}));

import {
  dispatchLiveSessionSurface,
  LiveSessionBridge,
  type LiveSurfaceDrivers,
} from "./liveSessionAdapter";

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

const appUrl = (path: string) => `stacks-dev://${path}`;

it("keeps the finished notification in sync with privacy and clears it on deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = await openStore();
  bridge.store = store;
  const root = createRoot(document.createElement("div"));
  try {
    await store.execute(
      store.prepare({
        type: "start",
        buyIn: 20000,
        startedAt: DateTime.makeUnsafe("2026-11-13T21:12:00Z"),
      }),
    );
    const visitId = store.getSnapshot().state!.visits[0]!.id;
    await act(async () => root.render(createElement(LiveSessionBridge)));
    await act(async () => {
      await store.execute(
        store.prepare({
          type: "finish",
          visitId,
          amount: 35000,
          finishedAt: DateTime.makeUnsafe("2026-11-13T22:12:00Z"),
        }),
      );
    });
    expect(bridge.showFinished).toHaveBeenLastCalledWith(
      expect.objectContaining({ resultText: "+$150" }),
    );

    bridge.privacyMode = true;
    await act(async () => root.render(createElement(LiveSessionBridge)));
    expect(bridge.clear).not.toHaveBeenCalled();
    expect(bridge.showFinished).toHaveBeenLastCalledWith(
      expect.objectContaining({ resultText: "••••" }),
    );

    await act(async () => {
      await store.execute(store.prepare({ type: "delete_visit", visitId }));
    });
    expect(bridge.clear).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    await store.close();
    bridge.store = undefined;
    bridge.privacyMode = false;
    vi.unstubAllGlobals();
  }
});

it("dispatches live, finished, and cleared transitions on Android", async () => {
  const store = await openStore();
  try {
    const start = DateTime.makeUnsafe("2026-11-13T21:12:00.000Z");
    await store.execute(store.prepare({ type: "start", buyIn: 20000, startedAt: start }));
    const visitId = store.getSnapshot().state!.visits[0]!.id;

    const androidDrivers: LiveSurfaceDrivers = {
      requestAndroidPermission: vi.fn(async () => true),
      showAndroidLive: vi.fn(async () => {}),
      showAndroidFinished: vi.fn(async () => {}),
      clearAndroid: vi.fn(async () => {}),
    };

    const live = reconcileLiveSessionSurface(
      null,
      store.getSnapshot().state,
      { showCents: false, privacyMode: false },
      appUrl,
    );
    await dispatchLiveSessionSurface(live, androidDrivers);
    expect(androidDrivers.requestAndroidPermission).toHaveBeenCalledTimes(1);
    expect(androidDrivers.showAndroidLive).toHaveBeenCalledWith(
      expect.objectContaining({
        buyInText: "$200",
        startedAtMs: DateTime.toEpochMillis(start),
        cashOutUrl: `stacks-dev://play/${visitId}?action=cash_out`,
      }),
    );
    expect(vi.mocked(androidDrivers.showAndroidLive).mock.lastCall?.[0]).not.toHaveProperty(
      "shortCriticalText",
    );

    await store.execute(
      store.prepare({
        type: "finish",
        visitId,
        amount: 35000,
        finishedAt: DateTime.makeUnsafe("2026-11-13T22:12:00.000Z"),
      }),
    );
    const finished = reconcileLiveSessionSurface(
      visitId,
      store.getSnapshot().state,
      { showCents: false, privacyMode: false },
      appUrl,
    );
    await dispatchLiveSessionSurface(finished, androidDrivers);
    expect(androidDrivers.showAndroidFinished).toHaveBeenCalledWith(
      expect.objectContaining({
        resultText: "+$150",
        durationText: "1h 00m played",
      }),
    );

    const idle = reconcileLiveSessionSurface(
      null,
      store.getSnapshot().state,
      { showCents: false, privacyMode: false },
      appUrl,
    );
    await dispatchLiveSessionSurface(idle, androidDrivers);
    expect(androidDrivers.clearAndroid).toHaveBeenCalledTimes(1);
  } finally {
    await store.close();
  }
});

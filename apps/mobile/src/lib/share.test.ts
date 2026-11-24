import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  written: new Map<string, string>(),
  available: true,
  ratio: 3,
  captured: new Array<ReadonlyArray<unknown>>(),
  deleted: new Array<string>(),
  gone: false,
  shareFails: false,
  shareAsync: vi.fn<(...args: ReadonlyArray<unknown>) => Promise<void>>(async () => {
    if (state.shareFails) throw new Error("no app");
  }),
  rnShare: vi.fn<(...args: ReadonlyArray<unknown>) => Promise<void>>(async () => {}),
}));

vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    readonly uri: string;
    constructor(
      readonly dir: string,
      readonly name?: string,
    ) {
      this.uri = name === undefined ? dir : `${dir}/${name}`;
    }
    get exists() {
      return !state.gone;
    }
    delete() {
      state.deleted.push(this.uri);
    }
    async write(content: string) {
      state.written.set(this.uri, content);
    }
  },
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => state.available,
  shareAsync: (...args: ReadonlyArray<unknown>) => state.shareAsync(...args),
}));

vi.mock("react-native", () => ({
  PixelRatio: { get: () => state.ratio },
  Share: {
    share: (...args: ReadonlyArray<unknown>) => state.rnShare(...args),
  },
}));

vi.mock("react-native-view-shot", () => ({
  captureRef: async (...args: ReadonlyArray<unknown>) => {
    state.captured.push(args);

    return "file:///cache/ReactNative/card.png";
  },
}));

vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
  callback();

  return 0;
});

import { shareCsv, shareImage } from "./share";

beforeEach(() => {
  state.written.clear();
  state.available = true;
  state.ratio = 3;
  state.captured = [];
  state.deleted = [];
  state.gone = false;
  state.shareFails = false;
  state.shareAsync.mockClear();
  state.rnShare.mockClear();
});

it("writes the CSV file to cache and shares it via expo-sharing when available", async () => {
  await shareCsv("sessions.csv", "a,b\n1,2\n");
  expect(state.written.get("file:///cache/sessions.csv")).toBe("a,b\n1,2\n");
  expect(state.shareAsync).toHaveBeenCalledWith("file:///cache/sessions.csv", {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: "sessions.csv",
  });
  expect(state.rnShare).not.toHaveBeenCalled();
});

it("falls back to React Native Share when native file sharing is unavailable", async () => {
  state.available = false;
  await shareCsv("sessions.csv", "a,b\n");
  expect(state.shareAsync).not.toHaveBeenCalled();
  expect(state.rnShare).toHaveBeenCalledWith({
    title: "sessions.csv",
    message: "a,b\n",
    url: "file:///cache/sessions.csv",
  });
});

it("captures the card at 1080 by 1350 physical pixels on any density", async () => {
  const view = { current: null };

  for (const ratio of [2, 2.625, 3]) {
    state.ratio = ratio;
    state.captured = [];
    await shareImage(view, "Vegas weekend");
    expect(state.captured).toEqual([
      [
        view,
        {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: 1080 / ratio,
          height: 1350 / ratio,
        },
      ],
    ]);
  }
});

it("shares the PNG and deletes it once sharing finishes", async () => {
  await shareImage({ current: null }, "Vegas weekend");
  expect(state.shareAsync).toHaveBeenCalledWith("file:///cache/ReactNative/card.png", {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: "Vegas weekend",
  });
  expect(state.deleted).toEqual(["file:///cache/ReactNative/card.png"]);
});

it("deletes the PNG when the share sheet fails, and lets the error through", async () => {
  state.shareFails = true;
  await expect(shareImage({ current: null }, "Vegas weekend")).rejects.toThrow("no app");
  expect(state.deleted).toEqual(["file:///cache/ReactNative/card.png"]);
});

it("captures nothing when the device can't share", async () => {
  state.available = false;
  await expect(shareImage({ current: null }, "Vegas weekend")).rejects.toThrow(
    "Sharing isn't available on this device.",
  );
  expect(state.captured).toEqual([]);
});

it("doesn't delete a PNG the share sheet already took", async () => {
  state.gone = true;
  await shareImage({ current: null }, "Vegas weekend");
  expect(state.deleted).toEqual([]);
});

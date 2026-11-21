import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  written: new Map<string, string>(),
  available: true,
  shareAsync: vi.fn<(...args: ReadonlyArray<unknown>) => Promise<void>>(async () => {}),
  rnShare: vi.fn<(...args: ReadonlyArray<unknown>) => Promise<void>>(async () => {}),
}));

vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    readonly uri: string;
    constructor(
      readonly dir: string,
      readonly name: string,
    ) {
      this.uri = `${dir}/${name}`;
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
  Share: {
    share: (...args: ReadonlyArray<unknown>) => state.rnShare(...args),
  },
}));

import { shareCsv } from "./share";

beforeEach(() => {
  state.written.clear();
  state.available = true;
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

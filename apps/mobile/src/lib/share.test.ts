import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  written: new Map<string, string>(),
  available: true,
  os: "ios",
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
  Platform: {
    get OS() {
      return state.os;
    },
  },
  Share: {
    share: (...args: ReadonlyArray<unknown>) => state.rnShare(...args),
  },
}));

import { shareCsv, shareLink } from "./share";

beforeEach(() => {
  state.written.clear();
  state.available = true;
  state.os = "ios";
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

it("shares a link on iOS as a url, so the share sheet treats it as one", async () => {
  await shareLink("https://colorup.test/t#abc", "Follow our table on Color Up:");
  expect(state.rnShare).toHaveBeenCalledWith({
    url: "https://colorup.test/t#abc",
    message: "Follow our table on Color Up:",
  });
});

it("shares a link on Android inside the message, which is all it reads", async () => {
  state.os = "android";
  await shareLink("https://colorup.test/t#abc", "Follow our table on Color Up:");
  expect(state.rnShare).toHaveBeenCalledWith({
    message: "Follow our table on Color Up: https://colorup.test/t#abc",
  });
});

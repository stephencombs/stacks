import { expect, it, vi } from "vite-plus/test";
vi.mock("expo-sqlite", () => {
  throw new Error("The web bridge must never import native SQLite.");
});

import { openRecordingStorage } from "./recordingStorage.web";
import { openIndexedDBRecordingStorage } from "@stacks/client-runtime/recordingStorageIndexedDB";

it("uses the shared browser adapter without loading SQLite", () => {
  expect(openRecordingStorage).toBe(openIndexedDBRecordingStorage);
});

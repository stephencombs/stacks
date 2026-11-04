import { beforeEach, expect, it, vi } from "vite-plus/test";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-file-system", () => ({
  Paths: { document: "documents" },
  File: class {
    constructor(
      readonly directory: string,
      readonly name: string,
    ) {}
    get exists() {
      return files.has(this.name);
    }
    delete() {
      files.delete(this.name);
    }
    textSync() {
      return files.get(this.name);
    }
    async write(value: string) {
      await Promise.resolve();
      files.set(this.name, value);
    }
    writeSync(value: string) {
      files.set(this.name, value);
    }
  },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: {} }));

import { outboxStorage } from "./outbox";
import { lastTripStorage } from "./tripStorage";

beforeEach(() => files.clear());

it("persists before save returns so suspension cannot lose a queued entry", () => {
  outboxStorage("alice").save("queued entry");
  expect(outboxStorage("alice").load()).toBe("queued entry");
  expect(outboxStorage("bob").load()).toBeNull();
});

it("persists the latest snapshot including removal", () => {
  const storage = outboxStorage("alice");
  storage.save("first entry");
  storage.save("two entries");
  expect(outboxStorage("alice").load()).toBe("two entries");
  storage.save("[]");
  expect(outboxStorage("alice").load()).toBe("[]");
});

it("saves and clears the last trip before returning, isolated by user", () => {
  const storage = lastTripStorage("alice");
  storage.save("trip-one");
  expect(lastTripStorage("alice").load()).toBe("trip-one");
  expect(lastTripStorage("bob").load()).toBeNull();
  storage.save("trip-two");
  expect(lastTripStorage("alice").load()).toBe("trip-two");
  storage.save(null);
  expect(lastTripStorage("alice").load()).toBeNull();
});

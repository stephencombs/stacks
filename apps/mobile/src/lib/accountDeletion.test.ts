import { beforeEach, expect, it, vi } from "vite-plus/test";

const disk = vi.hoisted(() => new Map<string, string>());

const calls = vi.hoisted(() => {
  const log: Array<string> = [];

  return log;
});

const faults = vi.hoisted(() => ({ database: false, signOut: false }));

vi.mock("expo-file-system", () => {
  class File {
    constructor(
      readonly directory: string,
      readonly name: string,
    ) {}
    get exists() {
      return disk.has(this.name);
    }
    delete() {
      disk.delete(this.name);
    }
    textSync() {
      return disk.get(this.name);
    }
    writeSync(value: string) {
      disk.set(this.name, value);
    }
  }

  class Directory {
    constructor(
      readonly directory: string,
      readonly name?: string,
    ) {}
    get exists() {
      return disk.has(`${this.name}/`);
    }
    delete() {
      disk.delete(`${this.name}/`);
    }
    list() {
      return [...disk.keys()].flatMap((name) =>
        name.endsWith("/") ? [] : [new File("documents", name)],
      );
    }
  }

  return { File, Directory, Paths: { document: "documents" } };
});

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: async (key: string) => void calls.push(`secure:${key}`),
}));

vi.mock("expo-apple-authentication", () => ({ signInAsync: async () => ({}) }));

vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: {} }));

vi.mock("./config", () => ({ apiUrl: "http://api", clerkPublishableKey: "pk_test" }));

vi.mock("./origin", () => ({ installOrigin: "origin" }));

vi.mock("./liveSessionAdapter", () => ({ endLiveSurface: async () => void calls.push("live") }));

vi.mock("./recording", () => ({
  recordingStore: { close: async () => void calls.push("close") },
}));

vi.mock("./recordingStorageSqlite", () => ({
  deleteRecordingDatabase: async () => {
    if (faults.database) throw new Error("file is busy");
    calls.push("database");
  },
}));

const signOut = vi.fn(async () => {
  if (faults.signOut) throw new Error("offline");
  calls.push("sign out");
});

vi.mock("./sessionToken", () => ({
  clerk: () => ({ signOut, user: { id: "user_alice" } }),
  sessionToken: async () => "token",
}));

const stock = () => {
  for (const name of [
    "outbox-user_alice.json",
    "outbox-user_bob.json",
    "last-trip-user_alice",
    "last-trip-user_bob",
    "stats-user_alice-g1.json",
    "stats-user_alice-g2.json",
    "stats-user_bob-g1.json",
    "contact-photos/",
  ])
    disk.set(name, "kept");
};

const wipe = { userId: "user_alice", status: "complete", appleManual: false } as const;

const freshLaunch = async () => {
  vi.resetModules();

  return import("./accountDeletion");
};

beforeEach(() => {
  disk.clear();
  calls.length = 0;
  faults.database = false;
  faults.signOut = false;
  signOut.mockClear();
  stock();
});

it("sets the marker, then ends the live surface, closes and wipes the ledger, the key and the files", async () => {
  const device = await freshLaunch();

  device.beginAccountWipe(wipe);

  expect(disk.has("account-wipe.json")).toBe(true);
  expect(calls).toEqual([]);

  await device.continueAccountWipe();

  expect(calls).toEqual(["live", "close", "database", "secure:color-up-actor"]);
  expect([...disk.keys()].sort()).toEqual([
    "account-wipe.json",
    "last-trip-user_bob",
    "outbox-user_bob.json",
    "stats-user_bob-g1.json",
  ]);

  await device.finishAccountWipe();

  expect(calls.at(-1)).toBe("sign out");
  expect(disk.has("account-wipe.json")).toBe(false);
});

it("finishes at the next launch when the app was killed before the wipe ran", async () => {
  (await freshLaunch()).beginAccountWipe(wipe);

  const nextLaunch = await freshLaunch();
  await nextLaunch.continueAccountWipe();
  await nextLaunch.finishAccountWipe();

  expect(calls).toEqual(["live", "close", "database", "secure:color-up-actor", "sign out"]);
  expect(disk.has("outbox-user_alice.json")).toBe(false);
  expect(disk.has("account-wipe.json")).toBe(false);
});

it("keeps the marker through a failure, then finishes on a repeat that clears the rest", async () => {
  const device = await freshLaunch();
  device.beginAccountWipe(wipe);
  faults.database = true;

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(signOut).not.toHaveBeenCalled();
  expect(disk.has("account-wipe.json")).toBe(true);
  expect(disk.has("outbox-user_alice.json")).toBe(false);

  faults.database = false;
  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(signOut).toHaveBeenCalledTimes(1);
  expect(disk.has("account-wipe.json")).toBe(false);
  expect(disk.has("outbox-user_bob.json")).toBe(true);
});

it("leaves the marker when sign-out fails, so the next launch signs out again", async () => {
  const device = await freshLaunch();
  device.beginAccountWipe(wipe);
  faults.signOut = true;

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(disk.has("account-wipe.json")).toBe(true);
  faults.signOut = false;

  const nextLaunch = await freshLaunch();
  await nextLaunch.continueAccountWipe();
  await nextLaunch.finishAccountWipe();

  expect(signOut).toHaveBeenCalledTimes(2);
  expect(disk.has("account-wipe.json")).toBe(false);
});

it("does nothing at launch when no wipe is pending", async () => {
  const device = await freshLaunch();

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(calls).toEqual([]);
  expect(disk.has("outbox-user_alice.json")).toBe(true);
});

import { beforeEach, expect, it, vi } from "vite-plus/test";

const disk = vi.hoisted(() => new Map<string, string>());

const calls = vi.hoisted(() => {
  const log: Array<string> = [];

  return log;
});

const faults = vi.hoisted(() => ({
  database: false,
  close: false,
  signOut: false,
  signOutHangs: false,
  clearToken: false,
}));

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
    constructor(readonly directory: string) {}
    list() {
      return [...disk.keys()].map((name) => new File("documents", name));
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

vi.mock("./contactPhotos", () => ({ clearContactPhotos: () => void calls.push("photos") }));

vi.mock("./liveSessionAdapter", () => ({ endLiveSurface: async () => void calls.push("live") }));

vi.mock("./recording", () => ({
  recordingStore: {
    close: async () => {
      if (faults.close) throw new Error("close failed");
      calls.push("close");
    },
  },
}));

vi.mock("./share", () => ({ deleteSharedCsvFiles: () => void calls.push("csv") }));

vi.mock("@clerk/expo/token-cache", () => ({
  tokenCache: {
    clearToken: async (key: string) => {
      if (faults.clearToken) throw new Error("keychain is locked");
      calls.push(`token:${key}`);
    },
  },
}));

vi.mock("./recordingStorageSqlite", () => ({
  deleteRecordingDatabase: async () => {
    if (faults.database) throw new Error("file is busy");
    calls.push("database");
  },
}));

const session = vi.hoisted(() => ({ signedIn: true }));

const signOut = vi.fn(async () => {
  if (faults.signOutHangs) return new Promise<void>(() => {});

  if (faults.signOut) throw new Error("offline");
  calls.push("sign out");
});

vi.mock("./sessionToken", () => ({
  clerk: () => ({ signOut, user: session.signedIn ? { id: "user_alice" } : null }),
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
  faults.close = false;
  faults.signOut = false;
  faults.signOutHangs = false;
  faults.clearToken = false;
  session.signedIn = true;
  signOut.mockClear();
  stock();
});

it("sets the marker, then ends the live surface, closes and wipes the ledger, the key and the files", async () => {
  const device = await freshLaunch();

  device.beginAccountWipe(wipe);

  expect(disk.has("account-wipe.json")).toBe(true);
  expect(calls).toEqual([]);

  await device.continueAccountWipe();

  expect(calls).toEqual(["live", "close", "database", "secure:color-up-actor", "photos", "csv"]);
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

  expect(calls).toEqual([
    "live",
    "close",
    "database",
    "secure:color-up-actor",
    "photos",
    "csv",
    "sign out",
  ]);
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

it("signs out locally when Clerk's sign-out is refused, so the wipe still reaches done", async () => {
  const device = await freshLaunch();
  device.beginAccountWipe(wipe);
  faults.signOut = true;

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(calls.at(-1)).toBe("token:__clerk_client_jwt");
  expect(disk.has("account-wipe.json")).toBe(false);
});

it("signs out locally when Clerk never answers, such as offline at launch", async () => {
  vi.useFakeTimers();

  try {
    const device = await freshLaunch();
    device.beginAccountWipe(wipe);
    faults.signOutHangs = true;

    await device.continueAccountWipe();
    const finishing = device.finishAccountWipe();

    expect(disk.has("account-wipe.json")).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    await finishing;

    expect(calls.at(-1)).toBe("token:__clerk_client_jwt");
    expect(disk.has("account-wipe.json")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the marker when even the local sign-out fails, and finishes on a repeat", async () => {
  const device = await freshLaunch();
  device.beginAccountWipe(wipe);
  faults.signOut = true;
  faults.clearToken = true;

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(disk.has("account-wipe.json")).toBe(true);

  faults.signOut = false;
  faults.clearToken = false;
  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(disk.has("account-wipe.json")).toBe(false);
});

it("goes on to delete the ledger when closing it fails, and reports a delete that fails too", async () => {
  const device = await freshLaunch();
  device.beginAccountWipe(wipe);
  faults.close = true;

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(calls).toContain("database");
  expect(disk.has("account-wipe.json")).toBe(false);

  const nextDevice = await freshLaunch();
  nextDevice.beginAccountWipe(wipe);
  faults.database = true;

  await nextDevice.continueAccountWipe();
  await nextDevice.finishAccountWipe();

  expect(disk.has("account-wipe.json")).toBe(true);
});

it("does nothing at launch when no wipe is pending", async () => {
  const device = await freshLaunch();

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(calls).toEqual([]);
  expect(disk.has("outbox-user_alice.json")).toBe(true);
});

it("starts a wipe of the signed-in account when the API says it was deleted", async () => {
  const device = await freshLaunch();

  device.onAccountDeleted();

  expect(JSON.parse(disk.get("account-wipe.json") ?? "")).toEqual({
    userId: "user_alice",
    status: "unknown",
    appleManual: false,
  });

  await device.continueAccountWipe();
  await device.finishAccountWipe();

  expect(disk.has("outbox-user_alice.json")).toBe(false);
  expect(disk.has("outbox-user_bob.json")).toBe(true);
  expect(signOut).toHaveBeenCalledTimes(1);
});

it("leaves the marker alone when nobody is signed in or a wipe is already under way", async () => {
  const device = await freshLaunch();
  session.signedIn = false;

  device.onAccountDeleted();

  expect(disk.has("account-wipe.json")).toBe(false);

  session.signedIn = true;
  device.beginAccountWipe({ userId: "user_alice", status: "pending", appleManual: true });
  device.onAccountDeleted();

  expect(JSON.parse(disk.get("account-wipe.json") ?? "").status).toBe("pending");
});

import { HttpClientError, TransportError } from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { expect, it } from "vite-plus/test";

import { makeDeviceWipe, previewFailure, type WipeMarker } from "./accountDeletion.ts";

const wipe: WipeMarker = { userId: "user_alice", status: "complete", appleManual: false };

const phone = () => {
  const files = new Set([
    "recording.db",
    "actor-key",
    "outbox-user_alice",
    "last-trip-user_alice",
    "stats-user_alice-g1",
    "outbox-user_bob",
  ]);

  let marker: string | null = null;
  const log: Array<string> = [];

  const remove = (name: string) => () => {
    log.push(name);
    files.delete(name);
  };

  const steps = [
    remove("recording.db"),
    remove("actor-key"),
    (userId: string) => {
      log.push("user files");

      for (const file of files)
        if (file.endsWith(`-${userId}`) || file.includes(`-${userId}-`)) files.delete(file);
    },
  ];

  const store = {
    read: () => marker,
    write: (value: string) => {
      log.push("marker");
      marker = value;
    },
    clear: () => {
      marker = null;
    },
  };

  return { files, log, steps, store };
};

it("sets the marker before the first step and clears it only when finished", async () => {
  const { log, steps, store } = phone();
  const device = makeDeviceWipe({ marker: store, steps });

  device.begin(wipe);
  await device.run(wipe);

  expect(log).toEqual(["marker", "recording.db", "actor-key", "user files"]);
  expect(device.pending()).toEqual(wipe);

  device.finish();

  expect(device.pending()).toBeNull();
});

it("removes only the account's files, and is safe to repeat", async () => {
  const { files, steps, store } = phone();
  const device = makeDeviceWipe({ marker: store, steps });

  await device.run(wipe);
  const after = [...files];
  await device.run(wipe);
  await device.run(wipe);

  expect(after).toEqual(["outbox-user_bob"]);
  expect([...files]).toEqual(after);
});

it("finishes at the next launch when the app was killed partway", async () => {
  const { files, steps, store } = phone();

  const firstLaunch = makeDeviceWipe({ marker: store, steps: steps.slice(0, 1) });
  firstLaunch.begin(wipe);
  await firstLaunch.run(wipe);

  expect(files.has("actor-key")).toBe(true);

  const nextLaunch = makeDeviceWipe({ marker: store, steps });

  expect(nextLaunch.pending()).toEqual(wipe);

  await nextLaunch.run(wipe);
  nextLaunch.finish();

  expect([...files]).toEqual(["outbox-user_bob"]);
  expect(nextLaunch.pending()).toBeNull();
});

it("runs every step when one fails, keeps the marker, and succeeds on the retry", async () => {
  const { files, store, steps } = phone();
  let failing = true;

  const flaky = [
    steps[0]!,
    () => {
      if (failing) throw new Error("keystore is locked");
    },
    steps[2]!,
  ];

  const device = makeDeviceWipe({ marker: store, steps: flaky });
  device.begin(wipe);

  await expect(device.run(wipe)).rejects.toBeInstanceOf(AggregateError);

  expect(files.has("recording.db")).toBe(false);
  expect(files.has("outbox-user_alice")).toBe(false);
  expect(device.pending()).toEqual(wipe);

  failing = false;
  await device.run(wipe);
  device.finish();

  expect(device.pending()).toBeNull();
});

it("ignores a marker it can't read", () => {
  const { steps, store } = phone();
  store.write("{not json");

  expect(makeDeviceWipe({ marker: store, steps }).pending()).toBeNull();
});

it("tells having no signal from a refusal", () => {
  const offline = new HttpClientError({
    reason: new TransportError({
      request: HttpClientRequest.get("http://api"),
    }),
  });

  expect(previewFailure(offline).kind).toBe("offline");
  expect(previewFailure(new Error("500")).kind).toBe("error");
  expect(previewFailure(new Error("500")).message).toMatch(/Couldn't reach Color Up/);
});

import { expect, test, type Page } from "@playwright/test";
import type { fixture } from "../fixture";
type StorageFixture = typeof fixture;

const boot = async (page: Page) => {
  await page.goto("/");
  await page.evaluate(() => import(new URL("/fixture.ts", location.href).href));
};
const open = (page: Page, label: string, namespace = "self") =>
  page.evaluate(
    async ({ label, namespace }) => {
      const fixture: StorageFixture = window.recordingStorageFixture;
      fixture.clients[label] = await fixture.open(namespace);
    },
    { label, namespace },
  );
const load = (page: Page, label = "a") =>
  page.evaluate((label) => window.recordingStorageFixture.clients[label]!.load(), label);
const commit = (page: Page, label: string, revision: number, payload: string) =>
  page.evaluate(
    ({ label, revision, payload }) =>
      window.recordingStorageFixture.clients[label]!.commit(revision, payload),
    { label, revision, payload },
  );
const failure = (page: Page, operation: "load" | "commit") =>
  page.evaluate(async (operation) => {
    try {
      const client = window.recordingStorageFixture.clients.a!;
      await (operation === "load" ? client.load() : client.commit(1, "replacement"));
      return "unexpected success";
    } catch (error) {
      return (error as { reason: string }).reason;
    }
  }, operation);

test.beforeEach(async ({ page }) => boot(page));

test("persists opaque payloads across reload and reopen", async ({ page }) => {
  await open(page, "a");
  expect(await load(page)).toEqual({ revision: 0 });
  expect(await commit(page, "a", 0, "not JSON")).toBe(1);
  await page.reload();
  await page.evaluate(() => import(new URL("/fixture.ts", location.href).href));
  await open(page, "a");
  expect(await load(page)).toEqual({ revision: 1, payload: "not JSON" });
  await page.evaluate(() => window.recordingStorageFixture.clients.a!.close());
  await open(page, "a");
  expect(await commit(page, "a", 1, "second")).toBe(2);
});

test("serializes simultaneous writers in two tabs and reports stale revisions", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await boot(second);
  await open(page, "a");
  await open(second, "b");
  const results = await Promise.allSettled([
    commit(page, "a", 0, "first"),
    commit(second, "b", 0, "second"),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect((await load(page)).revision).toBe(1);
  expect(await load(second, "b")).toEqual(await load(page));
  expect(
    await page.evaluate(async () => {
      try {
        await window.recordingStorageFixture.clients.a!.commit(0, "stale");
      } catch (error) {
        const conflict = error as {
          name: string;
          expectedRevision: number;
          actualRevision: number;
        };
        return {
          name: conflict.name,
          expectedRevision: conflict.expectedRevision,
          actualRevision: conflict.actualRevision,
        };
      }
    }),
  ).toEqual({ name: "RecordingStorageConflict", expectedRevision: 0, actualRevision: 1 });
  await second.close();
});

test("isolates namespaces and notification delivery", async ({ page }) => {
  await open(page, "a", "alice");
  await open(page, "b", "bob");
  expect(
    await page.evaluate(async () => {
      const { clients } = window.recordingStorageFixture;
      const events: unknown[] = [];
      clients.b!.subscribe((event) => events.push(event));
      await clients.a!.commit(0, "alice");
      await clients.b!.commit(0, "bob");
      return events;
    }),
  ).toEqual([{ type: "commit", revision: 1 }]);
  expect(await load(page)).toEqual({ revision: 1, payload: "alice" });
  expect(await load(page, "b")).toEqual({ revision: 1, payload: "bob" });
});

test("wakes another tab after durable commit with data-free notifications", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await boot(second);
  await open(page, "a");
  await open(second, "b");
  await second.evaluate(() => {
    window.recordingStorageFixture.nextChange = new Promise<unknown>((resolve) => {
      window.recordingStorageFixture.clients.b!.subscribe(async (event) => {
        resolve({ event, saved: await window.recordingStorageFixture.clients.b!.load() });
      });
    });
  });
  await commit(page, "a", 0, "private payload");
  expect(await second.evaluate(() => window.recordingStorageFixture.nextChange)).toEqual({
    event: { type: "commit", revision: 1 },
    saved: { revision: 1, payload: "private payload" },
  });
  await second.close();
});

test("unsubscribes and closes resources without later operations", async ({ page }) => {
  await open(page, "a");
  expect(
    await page.evaluate(async () => {
      const client = window.recordingStorageFixture.clients.a!;
      const events: unknown[] = [];
      const unsubscribe = client.subscribe((event) => events.push(event));
      unsubscribe();
      await client.commit(0, "saved");
      client.subscribe((event) => events.push(event));
      await client.close();
      await client.close();
      return events;
    }),
  ).toEqual([]);
  expect(await failure(page, "load")).toBe("closed");
  expect(await failure(page, "commit")).toBe("closed");
});

test("aborted transactions preserve history, emit nothing, and can recover", async ({ page }) => {
  await open(page, "a");
  await commit(page, "a", 0, "saved");
  expect(
    await page.evaluate(async () => {
      const put = IDBObjectStore.prototype.put;
      const events: unknown[] = [];
      const client = window.recordingStorageFixture.clients.a!;
      client.subscribe((event) => events.push(event));
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        request.addEventListener("success", () => this.transaction.abort());
        return request;
      };
      try {
        await client.commit(1, "lost");
        return { reason: "unexpected success", events };
      } catch (error) {
        return { reason: (error as { reason: string }).reason, events };
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    }),
  ).toEqual({ reason: "aborted", events: [] });
  expect(await load(page)).toEqual({ revision: 1, payload: "saved" });
  expect(await commit(page, "a", 1, "recovered")).toBe(2);
});

test("quota and read failures are visible and retain saved history", async ({ page }) => {
  await open(page, "a");
  await commit(page, "a", 0, "saved");
  expect(
    await page.evaluate(async () => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException("full", "QuotaExceededError");
      };
      try {
        await window.recordingStorageFixture.clients.a!.commit(1, "lost");
      } catch (error) {
        return (error as { reason: string }).reason;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    }),
  ).toBe("quota");
  expect(
    await page.evaluate(async () => {
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function () {
        throw new DOMException("unreadable", "NotReadableError");
      };
      try {
        await window.recordingStorageFixture.clients.a!.load();
      } catch (error) {
        return (error as { reason: string }).reason;
      } finally {
        IDBObjectStore.prototype.get = get;
      }
    }),
  ).toBe("read");
  expect(await load(page)).toEqual({ revision: 1, payload: "saved" });
});

test("corrupt revisions cannot be loaded or overwritten", async ({ page }) => {
  await open(page, "a");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("color-up-recording", 1);
        request.addEventListener("success", () => {
          const db = request.result;
          const transaction = db.transaction("documents", "readwrite");
          transaction.objectStore("documents").put({ revision: 0, payload: "history" }, "self");
          transaction.addEventListener("complete", () => {
            db.close();
            resolve();
          });
          transaction.addEventListener("abort", () => reject(transaction.error));
        });
      }),
  );
  expect(await failure(page, "load")).toBe("corrupt");
  expect(await failure(page, "commit")).toBe("corrupt");
});

test("unavailable storage and newer databases produce explicit errors", async ({ page }) => {
  expect(
    await page.evaluate(async () => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function () {
        throw new DOMException("denied", "SecurityError");
      };
      try {
        await window.recordingStorageFixture.open("self");
      } catch (error) {
        return (error as { reason: string }).reason;
      } finally {
        IDBFactory.prototype.open = original;
      }
    }),
  ).toBe("unavailable");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("color-up-recording", 2);
        request.addEventListener("success", () => {
          request.result.close();
          resolve();
        });
      }),
  );
  expect(
    await page.evaluate(async () => {
      try {
        await window.recordingStorageFixture.open("self");
      } catch (error) {
        return (error as { reason: string }).reason;
      }
    }),
  ).toBe("versionchange");
});

test("version changes invalidate the adapter and notify listeners", async ({ page }) => {
  await open(page, "a");
  expect(
    await page.evaluate(async () => {
      const client = window.recordingStorageFixture.clients.a!;
      const changed = new Promise<string>((resolve) =>
        client.subscribe((event) => {
          if (event.type === "error") resolve(event.error.reason);
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("color-up-recording", 2);
        request.addEventListener("success", () => {
          request.result.close();
          resolve();
        });
        request.addEventListener("error", () => reject(request.error));
      });
      return changed;
    }),
  ).toBe("versionchange");
  expect(await failure(page, "load")).toBe("versionchange");
});

test("blocked open rejects and closes its eventual connection", async ({ page }) => {
  expect(
    await page.evaluate(async () => {
      const blocker = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("color-up-recording", 1);
        request.addEventListener("success", () => resolve(request.result));
      });
      const original = IDBFactory.prototype.open;
      let upgraded: Promise<void> = Promise.resolve();
      IDBFactory.prototype.open = function (name) {
        const request = original.call(this, name, 2);
        upgraded = new Promise<void>((resolve) => {
          request.addEventListener("success", () => resolve());
          request.addEventListener("error", () => resolve());
        });
        return request;
      };
      try {
        let reason;
        try {
          await window.recordingStorageFixture.open("self");
        } catch (error) {
          reason = (error as { reason: string }).reason;
        }
        blocker.close();
        await upgraded;
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase("color-up-recording");
          request.addEventListener("success", () => resolve());
          request.addEventListener("error", () => reject(request.error));
          request.addEventListener("blocked", () =>
            reject(new Error("adapter leaked a connection")),
          );
        });
        return reason;
      } finally {
        IDBFactory.prototype.open = original;
        blocker.close();
      }
    }),
  ).toBe("blocked");
});

test("close drains accepted transactions and releases both database and channel", async ({
  page,
}) => {
  await open(page, "a");
  expect(
    await page.evaluate(async () => {
      const client = window.recordingStorageFixture.clients.a!;
      const originalClose = BroadcastChannel.prototype.close;
      let channelClosed = 0;
      BroadcastChannel.prototype.close = function () {
        channelClosed += 1;
        originalClose.call(this);
      };
      try {
        const committed = client.commit(0, "saved before close");
        const closed = client.close();
        const revision = await committed;
        await closed;
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase("color-up-recording");
          request.addEventListener("success", () => resolve());
          request.addEventListener("error", () => reject(request.error));
          request.addEventListener("blocked", () =>
            reject(new Error("close leaked a database connection")),
          );
        });
        return { revision, channelClosed };
      } finally {
        BroadcastChannel.prototype.close = originalClose;
      }
    }),
  ).toEqual({ revision: 1, channelClosed: 1 });
});

test("notification failure does not undo durable acknowledgement and stays visible", async ({
  page,
}) => {
  await open(page, "a");
  expect(
    await page.evaluate(async () => {
      const client = window.recordingStorageFixture.clients.a!;
      const originalPost = BroadcastChannel.prototype.postMessage;
      const failure = new Promise<string>((resolve) =>
        client.subscribe((change) => {
          if (change.type === "error") resolve(change.error.reason);
        }),
      );
      BroadcastChannel.prototype.postMessage = function () {
        throw new DOMException("channel failed", "InvalidStateError");
      };
      try {
        const revision = await client.commit(0, "saved");
        return { revision, reason: await failure };
      } finally {
        BroadcastChannel.prototype.postMessage = originalPost;
      }
    }),
  ).toEqual({ revision: 1, reason: "unavailable" });
  expect(await failure(page, "load")).toBe("unavailable");
  await open(page, "b");
  expect(await load(page, "b")).toEqual({ revision: 1, payload: "saved" });
});

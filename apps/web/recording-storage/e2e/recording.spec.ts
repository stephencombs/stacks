import { expect, test, type Page } from "@playwright/test";
import type { RecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingCommand } from "@stacks/contracts/recordingCommands";

declare global {
  interface Window {
    recording: RecordingStore;
    prepared: RecordingCommand;
    changed: Promise<void>;
  }
}
const boot = async (page: Page) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { makeRecordingStore, fixture } = await import("../fixture");
    window.recording = makeRecordingStore(await fixture.open("runtime"));
    await window.recording.ready;
  });
};
const reopen = async (page: Page) => {
  await page.evaluate(() => window.recording.close());
  await boot(page);
};
const snapshot = (page: Page) => page.evaluate(() => window.recording.getSnapshot());
const start = (page: Page) =>
  page.evaluate(async () => {
    const store = window.recording;
    const command = store.prepare({ type: "start", buyIn: 20000 });
    await store.execute(command);
    return command;
  });

test("runtime saves private play and receipts across real IndexedDB reloads", async ({ page }) => {
  await boot(page);
  const command = await start(page);
  const identity = (await snapshot(page)).state!.self;
  await reopen(page);
  expect((await snapshot(page)).state!.self).toEqual(identity);
  for (const [kind, amount] of [
    ["buy_in", 10000],
    ["cash_out", 10000],
  ] as const) {
    expect(
      await page.evaluate(
        () =>
          window.recording.review(window.recording.getSnapshot().state!.visits[0]!.id).summary
            .finalResult,
      ),
    ).toBeNull();
    await page.evaluate(
      async ({ kind, amount }) => {
        const store = window.recording;
        await store.execute(
          store.prepare({
            type: "add",
            visitId: store.getSnapshot().state!.visits[0]!.id,
            kind,
            amount,
          }),
        );
      },
      { kind, amount },
    );
    await reopen(page);
  }
  await page.evaluate(async () => {
    const store = window.recording;
    await store.execute(
      store.prepare({
        type: "finish",
        visitId: store.getSnapshot().state!.visits[0]!.id,
        amount: 25000,
      }),
    );
  });
  await reopen(page);
  expect(
    await page.evaluate(
      () => window.recording.review(window.recording.getSnapshot().state!.visits[0]!.id).summary,
    ),
  ).toMatchObject({ totals: { buyIn: 30000, cashOut: 35000 }, finalResult: 5000 });
  expect(await snapshot(page)).toMatchObject({
    publication: "private",
    status: "saved",
    state: {
      receipts: expect.arrayContaining([
        expect.objectContaining({
          command: expect.objectContaining({ operationId: command.operationId }),
        }),
      ]),
    },
  });
  await page.evaluate(() => window.recording.close());
});

for (const operation of ["start", "finish", "correct"] as const) {
  test(`runtime ${operation} rolls back an aborted IndexedDB transaction and retries identical work`, async ({
    page,
  }) => {
    await boot(page);
    if (operation !== "start") await start(page);
    const before = await snapshot(page);
    expect(
      await page.evaluate(async (operation) => {
        const store = window.recording;
        const state = store.getSnapshot().state!;
        window.prepared =
          operation === "start"
            ? store.prepare({ type: "start", buyIn: 20000 })
            : operation === "finish"
              ? store.prepare({ type: "finish", visitId: state.visits[0]!.id, amount: 25000 })
              : store.prepare({
                  type: "correct",
                  visitId: state.visits[0]!.id,
                  entryId: state.entries[0]!.id,
                  reason: "wrong amount",
                  replacement: { amount: 18000 },
                });
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = original.apply(this, args);
          request.addEventListener("success", () => this.transaction.abort());
          return request;
        };
        try {
          await store.execute(window.prepared);
          return "unexpected success";
        } catch (error) {
          return (error as { reason: string }).reason;
        } finally {
          IDBObjectStore.prototype.put = original;
        }
      }, operation),
    ).toBe("aborted");
    expect(await snapshot(page)).toMatchObject({
      status: "save_failed",
      revision: before.revision,
      state: before.state,
    });
    const receipt = await page.evaluate(() => window.recording.retry());
    expect(receipt.command.operationId).toBe(
      await page.evaluate(() => window.prepared.operationId),
    );
    await reopen(page);
    expect((await snapshot(page)).state!.receipts.at(-1)).toEqual(receipt);
    await page.evaluate(() => window.recording.close());
  });
}

test("runtime observes cross-tab commits and keeps an old finish reviewable", async ({
  page,
  context,
}) => {
  await boot(page);
  await start(page);
  const second = await context.newPage();
  await boot(second);
  await second.evaluate(() => {
    const store = window.recording;
    window.prepared = store.prepare({
      type: "finish",
      visitId: store.getSnapshot().state!.visits[0]!.id,
      amount: 25000,
    });
    window.changed = new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe(() => {
        if (store.getSnapshot().revision === 3) {
          unsubscribe();
          resolve();
        }
      });
    });
  });
  await page.evaluate(async () => {
    const store = window.recording;
    await store.execute(
      store.prepare({
        type: "add",
        visitId: store.getSnapshot().state!.visits[0]!.id,
        kind: "buy_in",
        amount: 10000,
      }),
    );
  });
  await second.evaluate(() => window.changed);
  expect(
    await second.evaluate(async () => {
      try {
        await window.recording.execute(window.prepared);
      } catch (error) {
        return (error as { reason: string }).reason;
      }
    }),
  ).toBe("conflict");
  expect((await snapshot(second)).failedCommand!.operationId).toBe(
    await second.evaluate(() => window.prepared.operationId),
  );
  await reopen(second);
  expect(
    await second.evaluate(
      () => window.recording.review(window.recording.getSnapshot().state!.visits[0]!.id).summary,
    ),
  ).toMatchObject({ totals: { buyIn: 30000 }, finalResult: null });
  await second.evaluate(() => window.recording.close());
  await second.close();
  await page.evaluate(() => window.recording.close());
});

test("runtime exposes unsupported saved documents without replacing history", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    await window.recording.close();
    const { fixture } = await import("../fixture");
    const storage = await fixture.open("runtime");
    const saved = await storage.load();
    const payload = JSON.parse(saved.payload!);
    payload.version = 99;
    await storage.commit(saved.revision, JSON.stringify(payload));
    await storage.close();
  });
  expect(
    await page.evaluate(async () => {
      const { makeRecordingStore, fixture } = await import("../fixture");
      const storage = await fixture.open("runtime");
      window.recording = makeRecordingStore(storage);
      try {
        await window.recording.ready;
      } catch (error) {
        return {
          reason: (error as { reason: string }).reason,
          snapshot: window.recording.getSnapshot(),
          document: await storage.load(),
        };
      }
    }),
  ).toMatchObject({
    reason: "load",
    snapshot: { state: null, status: "load_failed" },
    document: { revision: 2 },
  });
  await page.evaluate(() => window.recording.close());
});

// @vitest-environment happy-dom
import { makeRecordingStore } from "@stacks/client-runtime/recording";
import { RecordingProvider } from "@stacks/client-runtime/recordingReact";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingVisit } from "@stacks/client-runtime/recordingView";
import { VenueId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { VenueDialog } from "./RecordingForms";

vi.mock("@stacks/client-runtime/recordingReact", async (original) => ({
  ...(await original<typeof import("@stacks/client-runtime/recordingReact")>()),
  useVenueSearch: () => ({ status: "offline", venues: [], retry: () => {} }),
}));
vi.mock("~/components/ui/Dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

it("keeps an uncached existing casino distinct from Not listed, and clears it only when picked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let documentValue: RecordingStorageDocument = { revision: 0 };
  const adapter = () => ({
    load: async () => documentValue,
    commit: async (revision: number, payload: string) => {
      documentValue = { revision: revision + 1, payload };
      return documentValue.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });
  let store = makeRecordingStore(adapter());
  await store.ready;
  const venueId = VenueId.make(crypto.randomUUID());
  const start = store.prepare({ type: "start", buyIn: 20000, venueId });
  await store.execute(start);
  if (!("visitId" in start)) throw new Error("Expected a visit");
  const visit = recordingVisit(store.getSnapshot().state!, start.visitId)!;
  const host = document.createElement("div");
  const root = createRoot(host);
  const saved = vi.fn();
  const render = () =>
    root.render(
      <RecordingProvider store={store}>
        <VenueDialog visit={visit} onClose={() => {}} onSaved={saved} />
      </RecordingProvider>,
    );
  const clear = () =>
    Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Not listed"),
    )!;
  const submit = () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  try {
    await act(async () => render());
    expect(clear().getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("Current casino unavailable");
    await act(async () => submit());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBe(venueId);
    expect(store.getSnapshot().state!.receipts).toHaveLength(1);
    await act(async () => clear().click());
    expect(clear().getAttribute("aria-pressed")).toBe("true");
    await act(async () => submit());
    expect(saved).toHaveBeenCalledTimes(2);
    await store.close();
    store = makeRecordingStore(adapter());
    await store.ready;
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBeNull();
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.unstubAllGlobals();
  }
});

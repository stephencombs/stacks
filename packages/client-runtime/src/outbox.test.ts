import { describe, expect, it } from "@effect/vitest";
import { Conflict, EntryId, MinorUnits, PlayerId, SessionId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { makeOutbox, type Pending, type SendEntry } from "./outbox.ts";

const session = SessionId.make("0192e7a0-0000-7000-8000-000000000001");
const alex = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
let count = 0;
const entry = (amount: number) => ({
  id: EntryId.make(`0192e7a0-0000-7000-8000-1${String(++count).padStart(11, "0")}`),
  kind: "buy_in" as const,
  playerId: alex,
  counterpartyId: null,
  amount: MinorUnits.make(amount),
  occurredAt: DateTime.makeUnsafe(Date.UTC(2026, 9, 24, 2, count)),
  note: null,
  replacesEntryId: null,
});

const memory = (initial: string | null = null) => {
  let value = initial;
  return { load: () => value, save: (next: string) => void (value = next), read: () => value };
};
const offline: SendEntry = async () => ({ error: new Error("fetch failed") });
/** A server that records what reached it and refuses nothing. */
const server = () => {
  const received: Array<Pending> = [];
  const send: SendEntry = async (pending) => {
    received.push(pending);
    return { error: null };
  };
  return { received, send };
};

describe("outbox", () => {
  it("keeps an entry waiting while there's no signal, across a restart", async () => {
    const storage = memory();
    const first = makeOutbox(storage, offline);
    const buyIn = entry(50000);
    await first.add(session, buyIn);
    expect(first.pending()).toEqual([{ sessionId: session, entry: buyIn, failed: null }]);

    const { received, send } = server();
    const relaunched = makeOutbox(memory(storage.read()), send);
    expect(relaunched.pending().map((p) => p.entry.id)).toEqual([buyIn.id]);
    await relaunched.flush();
    expect(received.map((p) => p.entry)).toEqual([buyIn]);
    expect(relaunched.pending()).toEqual([]);
  });

  it("remembers what the server confirmed, so screens count it until they refetch", async () => {
    const { send } = server();
    const outbox = makeOutbox(memory(), send);
    const buyIn = entry(100);
    await outbox.add(session, buyIn);
    expect(outbox.pending()).toEqual([]);
    expect(outbox.sent()).toEqual([{ sessionId: session, entry: buyIn, failed: null }]);
    // Only for this launch: the server has it now, so nothing needs to survive a restart.
    expect(makeOutbox(memory(), send).sent()).toEqual([]);
  });

  it("sends in the order things happened and stops at the first network failure", async () => {
    let up = false;
    const sent: Array<number> = [];
    const outbox = makeOutbox(memory(), async ({ entry }) => {
      if (!up) return { error: new Error("timeout") };
      sent.push(entry.amount);
      return { error: null };
    });
    await outbox.add(session, entry(100));
    await outbox.add(session, entry(200));
    expect(sent).toEqual([]);
    up = true;
    await outbox.flush();
    expect(sent).toEqual([100, 200]);
  });

  it("marks a refused entry failed with the reason, and keeps sending the rest", async () => {
    const closed = entry(100);
    const later = entry(200);
    const outbox = makeOutbox(memory(), async ({ entry }) =>
      entry.id === closed.id
        ? { error: new Conflict({ reason: "session_closed" }) }
        : { error: null },
    );
    await outbox.add(session, closed);
    await outbox.add(session, later);
    expect(outbox.pending()).toEqual([
      {
        sessionId: session,
        entry: closed,
        failed: "This session is closed. An admin can reopen it.",
      },
    ]);
  });

  it("retries a failed entry with the same id, or lets it go", async () => {
    let refuse = true;
    const ids: Array<string> = [];
    const outbox = makeOutbox(memory(), async ({ entry }) => {
      ids.push(entry.id);
      return { error: refuse ? new Conflict({ reason: "session_closed" }) : null };
    });
    const buyIn = entry(100);
    await outbox.add(session, buyIn);
    refuse = false;
    await outbox.retry(buyIn.id);
    expect(ids).toEqual([buyIn.id, buyIn.id]);
    expect(outbox.pending()).toEqual([]);

    const undone = entry(300);
    const stuck = makeOutbox(memory(), offline);
    await stuck.add(session, undone);
    stuck.discard(undone.id);
    expect(stuck.pending()).toEqual([]);
  });

  it("starts empty when what's stored can't be read", () => {
    expect(makeOutbox(memory("not json"), offline).pending()).toEqual([]);
  });
});

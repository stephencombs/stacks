import { AddEntryRequest, SessionId } from "@stacks/contracts";
import * as Schema from "effect/Schema";

import { describeError, isRetryable } from "./errors.ts";

/** An entry recorded on this device that the server hasn't confirmed yet. */
const Pending = Schema.Struct({
  sessionId: SessionId,
  entry: AddEntryRequest,
  /** Why the server refused it; null while it's waiting to be sent. */
  failed: Schema.NullOr(Schema.String),
});
export type Pending = typeof Pending.Type;

const Stored = Schema.toCodecJson(Schema.Array(Pending));
const encode = Schema.encodeSync(Stored);
const decode = Schema.decodeUnknownSync(Stored);

/** Where the outbox keeps itself between launches: localStorage on web, a file on a phone. */
export interface OutboxStorage {
  readonly load: () => string | null;
  readonly save: (value: string) => void;
}

const SENT_KEPT = 200;

/** Sends one entry; resolves with the failure, or null once the server has it. */
export type SendEntry = (pending: Pending) => Promise<{ readonly error: unknown }>;

/**
 * Entries wait here until the server confirms them, so a buy-in logged with no signal isn't
 * lost. A retry reuses the entry's id, which the server treats as the same write. A failure the
 * network could explain keeps the entry waiting; a refusal marks it failed for the person to
 * retry or discard.
 */
export const makeOutbox = (storage: OutboxStorage, send: SendEntry) => {
  let pending: ReadonlyArray<Pending> = (() => {
    try {
      const saved = storage.load();
      return saved === null ? [] : decode(JSON.parse(saved));
    } catch {
      return [];
    }
  })();
  // Confirmed entries stay here for the launch: a screen showing the session hasn't refetched
  // the moment the server answers, and the entry must keep counting in between.
  let sent: ReadonlyArray<Pending> = [];
  const listeners = new Set<() => void>();
  let flushing: Promise<void> | null = null;

  const set = (next: ReadonlyArray<Pending>) => {
    pending = next;
    try {
      storage.save(JSON.stringify(encode(next)));
    } catch {
      // Full or unavailable storage still leaves the entry queued for this launch.
    }
    for (const listener of listeners) listener();
  };

  const sendWaiting = async () => {
    for (;;) {
      const next = pending.find((p) => p.failed === null);
      if (!next) return;
      const { error } = await send(next);
      if (error === null) {
        sent = [...sent, next].slice(-SENT_KEPT);
        set(pending.filter((p) => p.entry.id !== next.entry.id));
      } else if (isRetryable(error)) return;
      else
        set(
          pending.map((p) =>
            p.entry.id === next.entry.id ? { ...p, failed: describeError(error) } : p,
          ),
        );
    }
  };

  /** Sends what's waiting, oldest first, stopping at the first network failure. */
  const flush = () =>
    (flushing ??= sendWaiting().finally(() => {
      flushing = null;
    }));

  return {
    pending: () => pending,
    /** What the server confirmed since launch, oldest first. */
    sent: () => sent,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    flush,
    add: (sessionId: SessionId, entry: typeof AddEntryRequest.Type) => {
      set([...pending, { sessionId, entry, failed: null }]);
      return flush();
    },
    /** Drops an entry that hasn't been confirmed: an undo, or giving up on a refused one. */
    discard: (id: Pending["entry"]["id"]) => set(pending.filter((p) => p.entry.id !== id)),
    retry: (id: Pending["entry"]["id"]) => {
      set(pending.map((p) => (p.entry.id === id ? { ...p, failed: null } : p)));
      return flush();
    },
  };
};
export type Outbox = ReturnType<typeof makeOutbox>;

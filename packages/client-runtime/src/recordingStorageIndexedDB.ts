import {
  decodeRecordingStorageDocument,
  RecordingStorageConflict,
  RecordingStorageError,
  validateRecordingCommit,
  validateRecordingNamespace,
  type RecordingStorage,
  type RecordingStorageChange,
  type RecordingStorageDocument,
  type RecordingStorageFailure,
} from "./recordingStorage";

const DATABASE = "color-up-recording";
const DOCUMENTS = "documents";
const CHANNEL = "color-up-recording-changes";

const storageError = (cause: unknown, fallback: RecordingStorageFailure) => {
  if (cause instanceof RecordingStorageError || cause instanceof RecordingStorageConflict)
    return cause;
  const name = cause instanceof Error ? cause.name : "";
  const reason =
    name === "QuotaExceededError"
      ? "quota"
      : name === "AbortError"
        ? "aborted"
        : name === "VersionError"
          ? "versionchange"
          : name === "SecurityError" || name === "NotSupportedError"
            ? "unavailable"
            : fallback;
  return new RecordingStorageError(reason, cause);
};

/** IndexedDB serializes read/write transactions across every connection and tab. */
export const openIndexedDBRecordingStorage = async (
  namespace: string,
): Promise<RecordingStorage> => {
  validateRecordingNamespace(namespace);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false;
    try {
      if (!globalThis.indexedDB) throw new RecordingStorageError("unavailable");
      const request = indexedDB.open(DATABASE, 1);
      request.addEventListener("blocked", () => {
        rejected = true;
        reject(new RecordingStorageError("blocked"));
      });
      request.addEventListener("upgradeneeded", () => {
        if (rejected) {
          request.transaction?.abort();
          return;
        }
        request.result.createObjectStore(DOCUMENTS);
      });
      request.addEventListener("error", () => reject(storageError(request.error, "open")));
      request.addEventListener("success", () => {
        if (rejected) request.result.close();
        else resolve(request.result);
      });
    } catch (error) {
      reject(storageError(error, "open"));
    }
  });

  let channel: BroadcastChannel;
  try {
    if (!globalThis.BroadcastChannel) throw new RecordingStorageError("unavailable");
    channel = new BroadcastChannel(CHANNEL);
  } catch (error) {
    database.close();
    throw storageError(error, "open");
  }
  const listeners = new Set<(change: RecordingStorageChange) => void>();
  const pending = new Set<Promise<unknown>>();
  let failure: RecordingStorageError | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  const notify = (change: RecordingStorageChange) => {
    for (const listener of listeners) {
      queueMicrotask(() => {
        if (!closed && listeners.has(listener)) listener(change);
      });
    }
  };
  const invalidate = (error: RecordingStorageError) => {
    failure = error;
    database.close();
    channel.close();
    notify({ type: "error", error });
  };
  database.addEventListener("versionchange", () =>
    invalidate(new RecordingStorageError("versionchange")),
  );
  database.addEventListener("close", () => invalidate(new RecordingStorageError("unavailable")));
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "namespace" in data &&
      data.namespace === namespace &&
      "revision" in data &&
      typeof data.revision === "number" &&
      Number.isSafeInteger(data.revision) &&
      data.revision > 0
    ) {
      notify({ type: "commit", revision: data.revision });
    }
  });
  const assertOpen = () => {
    if (closed) throw new RecordingStorageError("closed");
    if (failure) throw failure;
  };

  const transact = (payload?: { expectedRevision: number; value: string }) => {
    const operation = payload ? "write" : "read";
    const result = new Promise<RecordingStorageDocument>((resolve, reject) => {
      let transaction: IDBTransaction;
      let document: RecordingStorageDocument;
      let problem: unknown;
      try {
        assertOpen();
        // Strict durability requests disk flush before oncomplete on supporting browsers.
        transaction = database.transaction(DOCUMENTS, payload ? "readwrite" : "readonly", {
          durability: "strict",
        });
      } catch (error) {
        reject(storageError(error, operation));
        return;
      }
      transaction.addEventListener("complete", () => resolve(document));
      transaction.addEventListener("abort", () =>
        reject(storageError(problem ?? transaction.error, "aborted")),
      );
      transaction.addEventListener("error", () => {
        problem ??= transaction.error;
      });
      const abort = (error: unknown) => {
        problem = storageError(error, operation);
        transaction.abort();
      };
      try {
        const store = transaction.objectStore(DOCUMENTS);
        const request = store.get(namespace);
        request.addEventListener("error", () => {
          problem = storageError(request.error, operation);
        });
        request.addEventListener("success", () => {
          try {
            document = decodeRecordingStorageDocument(request.result);
            if (!payload) return;
            if (document.revision !== payload.expectedRevision) {
              throw new RecordingStorageConflict(payload.expectedRevision, document.revision);
            }
            document = { revision: document.revision + 1, payload: payload.value };
            const write = store.put(document, namespace);
            write.addEventListener("error", () => {
              problem = storageError(write.error, "write");
            });
          } catch (error) {
            abort(error);
          }
        });
      } catch (error) {
        abort(error);
      }
    });
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result),
    );
    return result;
  };

  return {
    load: () => transact(),
    async commit(expectedRevision, payload) {
      assertOpen();
      validateRecordingCommit(expectedRevision, payload);
      const document = await transact({ expectedRevision, value: payload });
      // Notification failure cannot turn an already committed write into a failed save.
      if (!closed && !failure) {
        notify({ type: "commit", revision: document.revision });
        try {
          // eslint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel is origin-scoped and has no targetOrigin argument.
          channel.postMessage({ namespace, revision: document.revision });
        } catch (error) {
          invalidate(new RecordingStorageError("unavailable", error));
        }
      }
      return document.revision;
    },
    subscribe(listener) {
      assertOpen();
      const subscription = (change: RecordingStorageChange) => listener(change);
      listeners.add(subscription);
      return () => {
        listeners.delete(subscription);
      };
    },
    close() {
      if (closing) return closing;
      closed = true;
      listeners.clear();
      channel.close();
      closing = Promise.allSettled(pending).then(() => {
        database.close();
      });
      return closing;
    },
  };
};

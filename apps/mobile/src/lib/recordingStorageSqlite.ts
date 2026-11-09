import { openDatabaseAsync } from "expo-sqlite";
import {
  decodeRecordingStorageDocument,
  RecordingStorageConflict,
  RecordingStorageError,
  validateRecordingCommit,
  validateRecordingNamespace,
  type RecordingStorage,
  type RecordingStorageChange,
} from "@stacks/client-runtime/recordingStorage";

const listeners = new Map<string, Set<(change: RecordingStorageChange) => void>>();

export const openSQLiteRecordingStorage = async (namespace: string): Promise<RecordingStorage> => {
  validateRecordingNamespace(namespace);
  const database = await openDatabaseAsync("color-up-recording.db", {
    useNewConnection: true,
  }).catch((error: unknown) => {
    throw new RecordingStorageError("open", error);
  });
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS recording_documents (
        namespace TEXT PRIMARY KEY NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
        payload TEXT NOT NULL
      );
    `);
  } catch (error) {
    try {
      await database.closeAsync();
    } catch (closeError) {
      throw new RecordingStorageError("open", new AggregateError([error, closeError]));
    }
    throw new RecordingStorageError("open", error);
  }

  const ownListeners = new Set<(change: RecordingStorageChange) => void>();
  let closed = false;
  let closing: Promise<void> | undefined;
  let pending = Promise.resolve();
  const assertOpen = () => {
    if (closed) throw new RecordingStorageError("closed");
  };
  const run = <T>(operation: "read" | "write", task: () => Promise<T>): Promise<T> => {
    try {
      assertOpen();
    } catch (error) {
      return Promise.reject(error);
    }
    const result = pending.then(task).catch((error: unknown) => {
      if (error instanceof RecordingStorageConflict || error instanceof RecordingStorageError)
        throw error;
      throw new RecordingStorageError(operation, error);
    });
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const notify = (revision: number) => {
    for (const listener of listeners.get(namespace) ?? []) {
      queueMicrotask(() => {
        if (listeners.get(namespace)?.has(listener)) listener({ type: "commit", revision });
      });
    }
  };

  return {
    load: () =>
      run("read", async () => {
        const row = await database.getFirstAsync<unknown>(
          "SELECT revision, payload FROM recording_documents WHERE namespace = ?",
          namespace,
        );
        return decodeRecordingStorageDocument(row === null ? undefined : row);
      }),
    commit(expectedRevision, payload) {
      return run("write", async () => {
        validateRecordingCommit(expectedRevision, payload);
        // SDK 58 creates a separate connection. All CAS queries must use txn, never database.
        await database.withExclusiveTransactionAsync(async (txn) => {
          const row = await txn.getFirstAsync<unknown>(
            "SELECT revision, payload FROM recording_documents WHERE namespace = ?",
            namespace,
          );
          const document = decodeRecordingStorageDocument(row === null ? undefined : row);
          if (document.revision !== expectedRevision) {
            throw new RecordingStorageConflict(expectedRevision, document.revision);
          }
          await txn.runAsync(
            `INSERT INTO recording_documents(namespace, revision, payload) VALUES (?, ?, ?)
             ON CONFLICT(namespace) DO UPDATE SET revision = excluded.revision, payload = excluded.payload`,
            namespace,
            expectedRevision + 1,
            payload,
          );
        });
        notify(expectedRevision + 1);
        return expectedRevision + 1;
      });
    },
    subscribe(listener) {
      assertOpen();
      // The wrapper keeps subscriptions independent even when the same callback is reused.
      const subscription = (change: RecordingStorageChange) => listener(change);
      ownListeners.add(subscription);
      let shared = listeners.get(namespace);
      if (!shared) {
        shared = new Set();
        listeners.set(namespace, shared);
      }
      shared.add(subscription);
      return () => {
        if (!ownListeners.delete(subscription)) return;
        shared.delete(subscription);
        if (shared.size === 0) listeners.delete(namespace);
      };
    },
    close() {
      if (closing) return closing;
      closed = true;
      const shared = listeners.get(namespace);
      for (const listener of ownListeners) shared?.delete(listener);
      ownListeners.clear();
      if (shared?.size === 0) listeners.delete(namespace);
      closing = pending.then(async () => {
        try {
          await database.closeAsync();
        } catch (error) {
          throw new RecordingStorageError("close", error);
        }
      });
      return closing;
    },
  };
};

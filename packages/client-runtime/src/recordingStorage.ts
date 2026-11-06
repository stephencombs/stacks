/** The runtime owns payload encoding, schema validation and document migration. */
export type RecordingStorageDocument =
  | { readonly revision: 0; readonly payload?: never }
  | { readonly revision: number; readonly payload: string };

export type RecordingStorageChange =
  | { readonly type: "commit"; readonly revision: number }
  | { readonly type: "error"; readonly error: RecordingStorageError };

export interface RecordingStorage {
  load(): Promise<RecordingStorageDocument>;
  /** Resolves with the next revision only after the transaction commits. */
  commit(expectedRevision: number, payload: string): Promise<number>;
  /** A wake-up hint: reload after a commit. Notifications never contain the document. */
  subscribe(listener: (change: RecordingStorageChange) => void): () => void;
  /** Reject new work, drain accepted work, then release resources. Idempotent. */
  close(): Promise<void>;
}

export class RecordingStorageConflict extends Error {
  override readonly name = "RecordingStorageConflict";
  readonly expectedRevision: number;
  readonly actualRevision: number;
  constructor(expectedRevision: number, actualRevision: number) {
    super("Recording history changed. Reload before saving again.");
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export type RecordingStorageFailure =
  | "open"
  | "read"
  | "write"
  | "close"
  | "corrupt"
  | "invalid"
  | "closed"
  | "blocked"
  | "aborted"
  | "quota"
  | "unavailable"
  | "versionchange";

export class RecordingStorageError extends Error {
  override readonly name = "RecordingStorageError";
  readonly reason: RecordingStorageFailure;
  constructor(reason: RecordingStorageFailure, cause?: unknown) {
    super(`Recording storage failed (${reason}).`, { cause });
    this.reason = reason;
  }
}

export const validateRecordingNamespace = (namespace: string) => {
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new RecordingStorageError("invalid");
  }
};

export const validateRecordingCommit = (expectedRevision: number, payload: string) => {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER ||
    typeof payload !== "string"
  ) {
    throw new RecordingStorageError("invalid");
  }
};

export const decodeRecordingStorageDocument = (value: unknown): RecordingStorageDocument => {
  if (value === undefined) return { revision: 0 };
  if (
    typeof value !== "object" ||
    value === null ||
    !("revision" in value) ||
    !("payload" in value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision <= 0 ||
    typeof value.payload !== "string"
  ) {
    throw new RecordingStorageError("corrupt");
  }
  return { revision: value.revision, payload: value.payload };
};

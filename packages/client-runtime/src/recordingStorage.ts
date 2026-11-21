import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

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

const RecordingNamespace = Schema.NonEmptyString;

const ExpectedRevision = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThan(Number.MAX_SAFE_INTEGER),
);

const CommitPayload = Schema.String;

const StoredDocument = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThan(Number.MAX_SAFE_INTEGER)),
  payload: Schema.String,
});

const invalid = () => {
  throw new RecordingStorageError("invalid");
};

export const validateRecordingNamespace = (namespace: typeof RecordingNamespace.Encoded) => {
  if (Exit.isFailure(Schema.decodeUnknownExit(RecordingNamespace)(namespace))) invalid();
};

export const validateRecordingCommit = (
  expectedRevision: typeof ExpectedRevision.Encoded,
  payload: typeof CommitPayload.Encoded,
) => {
  if (
    Exit.isFailure(Schema.decodeUnknownExit(ExpectedRevision)(expectedRevision)) ||
    Exit.isFailure(Schema.decodeUnknownExit(CommitPayload)(payload))
  )
    invalid();
};

export const decodeRecordingStorageDocument: (
  value: typeof Schema.Unknown.Encoded,
) => RecordingStorageDocument = (value) => {
  if (value === undefined) return { revision: 0 };

  const decoded = Schema.decodeUnknownExit(StoredDocument)(value);

  if (Exit.isFailure(decoded)) throw new RecordingStorageError("corrupt");

  return { revision: decoded.value.revision, payload: decoded.value.payload };
};

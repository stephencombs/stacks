import { expect, it } from "vite-plus/test";
import {
  decodeRecordingStorageDocument,
  RecordingStorageError,
  validateRecordingCommit,
  validateRecordingNamespace,
} from "./recordingStorage";

it("distinguishes a missing document from damaged saved history", () => {
  expect(decodeRecordingStorageDocument(undefined)).toEqual({ revision: 0 });
  expect(decodeRecordingStorageDocument({ revision: 1, payload: "opaque" })).toEqual({
    revision: 1,
    payload: "opaque",
  });
  for (const value of [
    null,
    {},
    { revision: 0, payload: "" },
    { revision: 1.5, payload: "" },
    { revision: -1, payload: "" },
    { revision: Number.MAX_SAFE_INTEGER + 1, payload: "" },
    { revision: 1, payload: null },
    { revision: "1", payload: "" },
  ]) {
    expect(() => decodeRecordingStorageDocument(value)).toThrow(RecordingStorageError);
  }
});

it("accepts opaque strings but refuses invalid CAS revisions or namespaces", () => {
  expect(() => validateRecordingNamespace("")).toThrow(RecordingStorageError);
  expect(() => validateRecordingNamespace("principal:a")).not.toThrow();
  expect(() => validateRecordingCommit(0, "not JSON")).not.toThrow();
  for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    expect(() => validateRecordingCommit(revision, "payload")).toThrow(RecordingStorageError);
  }
});

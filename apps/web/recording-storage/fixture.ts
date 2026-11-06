import { openIndexedDBRecordingStorage } from "@stacks/client-runtime/recordingStorageIndexedDB";
import type { RecordingStorage } from "@stacks/client-runtime/recordingStorage";
export const fixture = {
  open: openIndexedDBRecordingStorage,
  nextChange: undefined as Promise<unknown> | undefined,
  clients: {} as Record<string, RecordingStorage>,
};
declare global {
  interface Window {
    recordingStorageFixture: typeof fixture;
  }
}
window.recordingStorageFixture = fixture;

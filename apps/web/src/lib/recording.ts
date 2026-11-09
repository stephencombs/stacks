import { openDeviceRecordingStore } from "@stacks/client-runtime/recordingReact";
import { openIndexedDBRecordingStorage } from "@stacks/client-runtime/recordingStorageIndexedDB";

/** This browser's private ledger, one per page for its whole life, whoever is signed in. */
export const recordingStore = openDeviceRecordingStore(openIndexedDBRecordingStorage);

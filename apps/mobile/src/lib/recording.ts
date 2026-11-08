import { openDeviceRecordingStore } from "@stacks/client-runtime/recordingReact";

import { openRecordingStorage } from "./recordingStorage";

/** This device's private ledger, one for the app's whole life, whoever is signed in. */
export const recordingStore = openDeviceRecordingStore(openRecordingStorage);

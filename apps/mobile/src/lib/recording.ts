import { openDeviceRecordingStore } from "@stacks/client-runtime/recordingReact";
import { useSyncExternalStore } from "react";

import { openRecordingStorage } from "./recordingStorage";

/** This device's private ledger, one for the app's whole life, whoever is signed in. */
export const recordingStore = openDeviceRecordingStore(openRecordingStorage);

/** The device ledger, for the table players only it holds. */
export const useRecordingState = () =>
  useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot).state;

import { makeDeviceWipe, type WipeMarker } from "@stacks/client-runtime/accountDeletion";
import { makeAccountApi, settle } from "@stacks/client-runtime/api";
import * as AppleAuthentication from "expo-apple-authentication";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { forgetActorKey } from "./actorKeys";
import { apiUrl, clerkPublishableKey } from "./config";
import { clearContactPhotos } from "./contactPhotos";
import { endLiveSurface } from "./liveSessionAdapter";
import { installOrigin } from "./origin";
import { deleteOutbox } from "./outbox";
import { recordingStore } from "./recording";
import { deleteRecordingDatabase } from "./recordingStorageSqlite";
import { clerk, sessionToken } from "./sessionToken";
import { deleteTripFiles } from "./tripStorage";

const account = makeAccountApi({
  baseUrl: apiUrl,
  getToken: () => sessionToken(),
  freshToken: () => sessionToken(true),
  origin: installOrigin,
});

export const accountApi = {
  preview: () => settle(account.preview),
  remove: (authorizationCode?: string) => settle(account.remove(authorizationCode)),
  gone: () => settle(account.gone),
};

const markerFile = new File(Paths.document, "account-wipe.json");

const deviceWipe = makeDeviceWipe({
  marker: {
    read: () => (markerFile.exists ? markerFile.textSync() : null),
    write: (value) => markerFile.writeSync(value),
    clear: () => {
      if (markerFile.exists) markerFile.delete();
    },
  },
  steps: [
    endLiveSurface,
    async () => {
      await recordingStore.close().catch(() => undefined);
      await deleteRecordingDatabase();
    },
    forgetActorKey,
    (userId) => {
      deleteOutbox(userId);
      deleteTripFiles(userId);
    },
    clearContactPhotos,
  ],
});

/**
 * Where a phone is in removing a deleted account: `waiting` to start, `wiping` its files,
 * `signing_out` of Clerk, `done`, or `failed` and ready to try again.
 */
export type AccountWipe = {
  readonly wipe: WipeMarker;
  readonly stage: "waiting" | "wiping" | "signing_out" | "done" | "failed";
};

let current: AccountWipe | null | undefined;
const listeners = new Set<() => void>();

const read = () => {
  if (current === undefined) {
    const unfinished = deviceWipe.pending();
    current = unfinished ? { wipe: unfinished, stage: "waiting" } : null;
  }

  return current;
};

const set = (next: AccountWipe) => {
  current = next;

  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => void listeners.delete(listener);
};

/** The wipe in progress, or null. A wipe the last launch didn't finish is found here at startup. */
export const useAccountWipe = () => useSyncExternalStore(subscribe, read);

/**
 * Marks this phone for a wipe. The app then shows the wipe screen in place of everything else, so
 * sync and realtime stop, and the screen starts the wipe.
 */
export const beginAccountWipe = (wipe: WipeMarker) => {
  if (read()) return;
  deviceWipe.begin(wipe);
  set({ wipe, stage: "waiting" });
};

/** Runs the wipe's steps, and runs them again after a failure. */
export const continueAccountWipe = async () => {
  const active = read();

  if (active?.stage !== "waiting" && active?.stage !== "failed") return;
  set({ wipe: active.wipe, stage: "wiping" });

  try {
    await deviceWipe.run(active.wipe);
    set({ wipe: active.wipe, stage: "signing_out" });
  } catch {
    set({ wipe: active.wipe, stage: "failed" });
  }
};

/** Signs out of Clerk, then forgets the marker: the last thing a wipe does. */
export const finishAccountWipe = async () => {
  const active = read();

  if (active?.stage !== "signing_out") return;

  try {
    if (clerkPublishableKey) await clerk().signOut();
    deviceWipe.finish();
    set({ wipe: active.wipe, stage: "done" });
  } catch {
    set({ wipe: active.wipe, stage: "failed" });
  }
};

const REFUSAL_COOLDOWN_MS = 60_000;
let lastRefusalCheck = 0;

/**
 * The API refused the session. A deleted account gets that on every request, and so does a token
 * the API can't verify, which must never cost someone their play. So it wipes only when a fresh
 * token is refused too, and asks at most once a minute.
 */
export const onAccountRefused = () => {
  const now = Date.now();

  if (read() || now - lastRefusalCheck < REFUSAL_COOLDOWN_MS) return;
  lastRefusalCheck = now;
  const userId = clerk().user?.id;

  if (!userId) return;

  void accountApi.gone().then(
    (gone) => {
      if (gone) beginAccountWipe({ userId, status: "unknown", appleManual: false });
    },
    () => undefined,
  );
};

/** The Apple sheet's one-use code, for the server to revoke. Null when it's skipped or can't show. */
export const askAppleForCode = async () => {
  if (Platform.OS !== "ios") return null;

  try {
    return (await AppleAuthentication.signInAsync()).authorizationCode;
  } catch {
    return null;
  }
};

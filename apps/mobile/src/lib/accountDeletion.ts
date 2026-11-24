import { makeDeviceWipe, type WipeMarker } from "@stacks/client-runtime/accountDeletion";
import { makeAccountApi, settle } from "@stacks/client-runtime/api";
import { tokenCache } from "@clerk/expo/token-cache";
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
import { deleteSharedCsvFiles } from "./share";
import { deleteTripFiles } from "./tripStorage";

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
      const closeFailures: Array<unknown> = [];

      try {
        await recordingStore.close();
      } catch (error) {
        closeFailures.push(error);
      }

      try {
        await deleteRecordingDatabase();
      } catch (error) {
        throw closeFailures[0] ?? error;
      }
    },
    forgetActorKey,
    (userId) => {
      deleteOutbox(userId);
      deleteTripFiles(userId);
    },
    clearContactPhotos,
    deleteSharedCsvFiles,
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

const SIGN_OUT_MS = 8_000;

// WARNING: the key Clerk's Expo client saves its session under; it isn't exported.
const CLERK_CLIENT_KEY = "__clerk_client_jwt";

const signOutOfClerk = async () => {
  if (!clerkPublishableKey) return;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      clerk().signOut(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sign-out timed out")), SIGN_OUT_MS);
      }),
    ]);
  } catch {
    await tokenCache?.clearToken?.(CLERK_CLIENT_KEY);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Signs out of Clerk, then forgets the marker: the last thing a wipe does. Clerk can't always
 * answer, offline or once its user is deleted, so a refused or silent sign-out falls back to
 * deleting the saved session, which the restart then finds gone.
 */
export const finishAccountWipe = async () => {
  const active = read();

  if (active?.stage !== "signing_out") return;

  try {
    await signOutOfClerk();
    deviceWipe.finish();
    set({ wipe: active.wipe, stage: "done" });
  } catch {
    set({ wipe: active.wipe, stage: "failed" });
  }
};

/** The API said 401 `account_deleted`: this account is gone, so its data goes from this phone. */
export const onAccountDeleted = () => {
  const userId = clerk().user?.id;

  if (!userId || read()) return;
  beginAccountWipe({ userId, status: "unknown", appleManual: false });
};

const account = makeAccountApi({
  baseUrl: apiUrl,
  getToken: () => sessionToken(),
  origin: installOrigin,
  onAccountDeleted: () => onAccountDeleted(),
});

export const accountApi = {
  preview: () => settle(account.preview),
  remove: (authorizationCode?: string) => settle(account.remove(authorizationCode)),
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

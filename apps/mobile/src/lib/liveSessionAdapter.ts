import {
  reconcileLiveSessionSurface,
  type LiveSessionSurface,
  type LiveSurfacePrefs,
} from "@stacks/client-runtime/liveSessionSurface";
import * as DateTime from "effect/DateTime";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PermissionsAndroid, Platform } from "react-native";

import {
  liveSessionUpdates,
  type FinishedNotificationPayload,
  type LiveNotificationPayload,
} from "../../modules/live-session-updates/src";
import { appUrl } from "./config";
import { usePreferences } from "./preferences";
import { recordingStore } from "./recording";
import { useTheme } from "./theme";

export type LiveSurfaceDrivers = {
  readonly requestAndroidPermission: () => Promise<boolean>;
  readonly showAndroidLive: (payload: LiveNotificationPayload) => Promise<void>;
  readonly showAndroidFinished: (payload: FinishedNotificationPayload) => Promise<void>;
  readonly clearAndroid: () => Promise<void>;
};

let androidPermissionAsked = false;

const requestAndroidPermission = async () => {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return true;

  if (androidPermissionAsked) return true;
  androidPermissionAsked = true;

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

const surfaceSignature = (surface: LiveSessionSurface): string => {
  if (surface.kind === "idle") return "idle";

  if (surface.kind === "live") {
    return [
      "live",
      surface.visitId,
      surface.gameLabel,
      surface.venueLabel,
      surface.buyInText,
      surface.startedAtMs,
      surface.privacyMode,
    ].join("|");
  }

  return [
    "finished",
    surface.visitId,
    surface.gameLabel,
    surface.finishedAtMs,
    surface.finishedTimeText,
    surface.resultText,
    surface.durationText,
    surface.summaryLine,
    surface.privacyMode,
  ].join("|");
};

export async function dispatchLiveSessionSurface(
  surface: LiveSessionSurface,
  drivers: LiveSurfaceDrivers,
): Promise<void> {
  if (surface.kind === "live") {
    await drivers.requestAndroidPermission();
    await drivers.showAndroidLive({
      gameLabel: surface.gameLabel,
      venueLabel: surface.venueLabel,
      buyInText: surface.buyInText,
      startedAtMs: surface.startedAtMs,
      privacyMode: surface.privacyMode,
      openUrl: surface.deepLinks.open,
      rebuy100Url: surface.deepLinks.rebuy100,
      rebuy200Url: surface.deepLinks.rebuy200,
      cashOutUrl: surface.deepLinks.cashOut,
    });

    return;
  }

  if (surface.kind === "finished") {
    await drivers.showAndroidFinished({
      gameLabel: surface.gameLabel,
      finishedTimeText: surface.finishedTimeText,
      resultText: surface.resultText,
      durationText: surface.durationText,
      summaryLine: surface.summaryLine,
      finishedAtMs: surface.finishedAtMs,
      privacyMode: surface.privacyMode,
      seeSessionUrl: surface.deepLinks.seeSession,
      backAtTableUrl: surface.deepLinks.backAtTable,
    });

    return;
  }

  await drivers.clearAndroid();
}

const defaultDrivers: LiveSurfaceDrivers = {
  requestAndroidPermission,
  showAndroidLive: async (payload) => {
    await liveSessionUpdates?.showLive(payload);
  },
  showAndroidFinished: async (payload) => {
    await liveSessionUpdates?.showFinished(payload);
  },
  clearAndroid: async () => {
    await liveSessionUpdates?.clear();
  },
};

/** Synchronizes the recording session with the system's live surface. */
export function LiveSessionBridge() {
  const snapshot = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot);
  const prefs = usePreferences();
  const themeChoice = useTheme();

  const colorScheme =
    Platform.OS === "ios" ? (themeChoice === "system" ? null : themeChoice) : null;

  const previous = useRef<LiveSessionSurface>({ kind: "idle" });
  const lastSignature = useRef<string | null>(null);
  const pending = useRef(Promise.resolve());

  useEffect(() => {
    if (!snapshot.state) return;

    const modePrefs: LiveSurfacePrefs = {
      showCents: prefs.showCents,
      privacyMode: prefs.privacyMode,
    };

    const surface = reconcileLiveSessionSurface(
      previous.current.kind === "idle" ? null : previous.current.visitId,
      snapshot.state,
      modePrefs,
      appUrl,
      DateTime.zoneMakeLocal(),
    );

    previous.current = surface;
    const sig = `${surfaceSignature(surface)}|${colorScheme ?? "system"}`;

    if (sig === lastSignature.current) return;
    lastSignature.current = sig;
    pending.current = pending.current
      .then(async () => {
        if (Platform.OS === "ios") {
          const { dispatchIosLiveSession } = await import("./iosLiveSession");

          if (lastSignature.current === sig) await dispatchIosLiveSession(surface, colorScheme);
        } else if (lastSignature.current === sig) {
          await dispatchLiveSessionSurface(surface, defaultDrivers);
        }
      })
      .catch(() => {
        if (lastSignature.current === sig) lastSignature.current = null;
      });
  }, [snapshot.state, prefs.showCents, prefs.privacyMode, colorScheme]);

  return null;
}

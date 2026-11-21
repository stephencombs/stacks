export type LiveNotificationPayload = {
  readonly gameLabel: string;
  readonly venueLabel: string;
  readonly buyInText: string;
  readonly startedAtMs: number;
  readonly privacyMode: boolean;
  readonly openUrl: string;
  readonly rebuy100Url: string;
  readonly rebuy200Url: string;
  readonly cashOutUrl: string;
};

export type FinishedNotificationPayload = {
  readonly gameLabel: string;
  readonly finishedTimeText: string;
  readonly resultText: string;
  readonly durationText: string;
  readonly summaryLine: string;
  readonly finishedAtMs: number;
  readonly privacyMode: boolean;
  readonly seeSessionUrl: string;
  readonly backAtTableUrl: string;
};

type LiveUpdatesStatus = {
  readonly supported: boolean;
  readonly notificationsEnabled: boolean;
  readonly canPostPromoted: boolean;
  readonly apiLevel: number;
};

type NativeLiveSessionUpdates = {
  getStatus: () => Promise<LiveUpdatesStatus>;
  showLive: (payload: LiveNotificationPayload) => Promise<void>;
  showFinished: (payload: FinishedNotificationPayload) => Promise<void>;
  clear: () => Promise<void>;
};

const loadNative = () => {
  if (typeof process !== "undefined" && process.env?.VITEST) return null;

  try {
    // SAFETY: this specifier is the installed expo package, which exposes requireOptionalNativeModule.
    const expo = require("expo") as typeof import("expo");

    return expo.requireOptionalNativeModule<NativeLiveSessionUpdates>("LiveSessionUpdates");
  } catch {
    return null;
  }
};

export const liveSessionUpdates: NativeLiveSessionUpdates | null = loadNative();

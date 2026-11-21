import { MinorUnits, type VisitId } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";

import { formatDuration, formatTime, venueLabel } from "./format.ts";
import type { RecordingState } from "./recordingState.ts";
import {
  RECORDING_CURRENCY,
  recordingHome,
  visitTitle,
  type RecordedVisit,
} from "./recordingView.ts";

export type LiveSurfacePrefs = {
  readonly showCents: boolean;
  readonly privacyMode: boolean;
};

export type LiveSessionSurfaceLive = {
  readonly kind: "live";
  readonly visitId: VisitId;
  readonly gameLabel: string;
  readonly venueLabel: string;
  readonly title: string;
  readonly buyIn: MinorUnits;
  readonly buyInText: string;
  readonly startedAtMs: number;
  readonly privacyMode: boolean;
  readonly deepLinks: {
    readonly open: string;
    readonly rebuy100: string;
    readonly rebuy200: string;
    readonly cashOut: string;
  };
};

export type LiveSessionSurfaceFinished = {
  readonly kind: "finished";
  readonly visitId: VisitId;
  readonly gameLabel: string;
  readonly venueLabel: string;
  readonly title: string;
  readonly finishedTimeText: string;
  readonly result: MinorUnits;
  readonly resultText: string;
  readonly durationText: string;
  readonly buyInText: string;
  readonly cashOutText: string;
  readonly hourlyText: string;
  readonly summaryLine: string;
  readonly finishedAtMs: number;
  readonly privacyMode: boolean;
  readonly deepLinks: {
    readonly seeSession: string;
    readonly backAtTable: string;
  };
};

export type LiveSessionSurface =
  | LiveSessionSurfaceLive
  | LiveSessionSurfaceFinished
  | { readonly kind: "idle" };

const HIDDEN = "••••";

const money = (
  amount: MinorUnits,
  prefs: LiveSurfacePrefs,
  signDisplay: "auto" | "always" | "exceptZero" = "auto",
) =>
  prefs.privacyMode
    ? HIDDEN
    : formatMoney(amount, RECORDING_CURRENCY, {
        signDisplay,
        trailingZeroDisplay: prefs.showCents ? "auto" : "stripIfInteger",
      });

const MIN_HOURLY_MS = 60_000n;

const hourlyRate = (result: MinorUnits, startedAt: DateTime.Utc, finishedAt: DateTime.Utc) => {
  const ms = BigInt(
    Math.max(0, DateTime.toEpochMillis(finishedAt) - DateTime.toEpochMillis(startedAt)),
  );

  if (ms < MIN_HOURLY_MS) return null;
  const numerator = BigInt(result) * 3_600_000n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude * 2n + ms) / (ms * 2n);

  return MinorUnits.make(Number(numerator < 0n ? -rounded : rounded));
};

const liveFromVisit: (
  item: RecordedVisit,
  prefs: LiveSurfacePrefs,
  appUrl: (path: string) => string,
) => LiveSessionSurfaceLive = (item, prefs, appUrl) => {
  const gameLabel = visitTitle(item.table);
  const casino = venueLabel(item.venue);
  const buyInText = money(item.totals.buyIn, prefs);
  const startedAtMs = DateTime.toEpochMillis(item.visit.startedAt);
  const path = `play/${item.visit.id}`;

  return {
    kind: "live",
    visitId: item.visit.id,
    gameLabel,
    venueLabel: casino,
    title: `${gameLabel} · ${buyInText}`,
    buyIn: item.totals.buyIn,
    buyInText,
    startedAtMs,
    privacyMode: prefs.privacyMode,
    deepLinks: {
      open: appUrl(path),
      rebuy100: appUrl(path),
      rebuy200: appUrl(path),
      cashOut: appUrl(`${path}?action=cash_out`),
    },
  };
};

const finishedFromVisit: (
  item: RecordedVisit,
  prefs: LiveSurfacePrefs,
  appUrl: (path: string) => string,
  timeZone?: DateTime.TimeZone,
) => LiveSessionSurfaceFinished = (item, prefs, appUrl, timeZone) => {
  const finishedAt = item.visit.finishedAt!;
  const gameLabel = visitTitle(item.table);
  const casino = venueLabel(item.venue);
  const result = item.finalResult!;
  const resultText = money(result, prefs, "exceptZero");
  const buyInText = money(item.totals.buyIn, prefs);
  const cashOutText = money(item.totals.cashOut, prefs);
  const hourly = hourlyRate(result, item.visit.startedAt, finishedAt);

  const hourlyText =
    hourly === null ? "" : prefs.privacyMode ? HIDDEN : `${money(hourly, prefs, "exceptZero")}/hr`;

  const durationText = `${formatDuration(item.visit.startedAt, finishedAt)} played`;
  const path = `play/${item.visit.id}`;
  const summaryParts = [`${buyInText} in`, `${cashOutText} out`];

  if (hourlyText) summaryParts.push(hourlyText);

  return {
    kind: "finished",
    visitId: item.visit.id,
    gameLabel,
    venueLabel: casino,
    title: `${gameLabel} · ${resultText}`,
    finishedTimeText: `Finished ${formatTime(finishedAt, timeZone)}`,
    result,
    resultText,
    durationText,
    buyInText,
    cashOutText,
    hourlyText,
    summaryLine: prefs.privacyMode ? "Amounts hidden" : summaryParts.join(" · "),
    finishedAtMs: DateTime.toEpochMillis(finishedAt),
    privacyMode: prefs.privacyMode,
    deepLinks: {
      seeSession: appUrl(path),
      backAtTable: appUrl(path),
    },
  };
};

/**
 * Own active live session for lock screen / Dynamic Island / Android Live Update, reading only
 * this player's money.
 */
export const liveSessionSurface: (
  state: RecordingState | null,
  prefs: LiveSurfacePrefs,
  appUrl: (path: string) => string,
) => LiveSessionSurface = (state, prefs, appUrl) => {
  if (!state) return { kind: "idle" };
  const active = recordingHome(state).active[0];

  return active ? liveFromVisit(active, prefs, appUrl) : { kind: "idle" };
};

/**
 * Keeps a tracked session's summary through cash-out and subsequent edits until the session is
 * deleted or a different active session takes over.
 */
export const reconcileLiveSessionSurface: (
  previousVisitId: VisitId | null,
  state: RecordingState | null,
  prefs: LiveSurfacePrefs,
  appUrl: (path: string) => string,
  timeZone?: DateTime.TimeZone,
) => LiveSessionSurface = (previousVisitId, state, prefs, appUrl, timeZone) => {
  if (!state) return { kind: "idle" };
  const home = recordingHome(state);
  const active = home.active[0];

  if (active) return liveFromVisit(active, prefs, appUrl);

  if (previousVisitId !== null) {
    const finished = home.finished.find((item) => item.visit.id === previousVisitId);

    if (finished) return finishedFromVisit(finished, prefs, appUrl, timeZone);
  }

  return { kind: "idle" };
};

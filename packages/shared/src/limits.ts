import * as DateTime from "effect/DateTime";
import {
  MinorUnits,
  type CurrencyCode,
  type PlayerId,
  type PlayerResult,
  type SessionId,
  type SessionStatus,
  type UserLimits,
} from "@stacks/contracts";

import { decimalSeparator, minorUnitDigits } from "./money.ts";

export const SESSION_REMINDER_OPTIONS = [120, 180, 240] as const;

export type LossLimitLevel = "approaching" | "reached";

export interface LossLimitNotice {
  readonly level: LossLimitLevel;
  readonly loss: MinorUnits;
  readonly limit: MinorUnits;
  readonly percent: number;
  readonly remaining: MinorUnits;
  readonly over: MinorUnits;
}

export interface SessionReminderNotice {
  readonly minutesPlayed: number;
  readonly reminderMinutes: number;
}

export interface LimitSessionInput {
  readonly myJoinedAt?: DateTime.Utc | null;
  readonly session: {
    readonly id: SessionId;
    readonly status: SessionStatus;
    readonly startedAt: DateTime.Utc;
  };
  readonly playing: ReadonlyArray<PlayerId>;
  readonly results: ReadonlyArray<Pick<PlayerResult, "playerId" | "net">>;
}

export interface LocalSessionOverride {
  readonly sessionId: SessionId;
  readonly status: SessionStatus;
  readonly myJoinedAt?: DateTime.Utc | null;
  readonly playing: boolean;
  readonly net: MinorUnits;
}

/**
 * One player's net across a trip's sessions, live ones included: un-cashed-out buy-ins sit in
 * `net` as negative exposure until cashed out. `local` swaps in a live screen's unsaved tally.
 */
export const tripPlayerNet = (
  sessions: ReadonlyArray<{
    readonly session: Pick<LimitSessionInput["session"], "id">;
    readonly results: LimitSessionInput["results"];
  }>,
  playerId: PlayerId,
  local?: Pick<LocalSessionOverride, "sessionId" | "net">,
): MinorUnits => {
  let total = 0;
  let seenLocal = false;
  for (const s of sessions) {
    if (local && s.session.id === local.sessionId) {
      total += local.net;
      seenLocal = true;
      continue;
    }
    for (const r of s.results) {
      if (r.playerId === playerId) total += r.net;
    }
  }
  if (local && !seenLocal) total += local.net;
  return MinorUnits.make(total);
};

// BigInt keeps threshold checks exact up to MAX_SAFE_INTEGER with no floats near money.
export const lossLimitNotice = (
  net: MinorUnits,
  limit: MinorUnits | null,
): LossLimitNotice | null => {
  if (limit === null || limit <= 0 || net >= 0) return null;
  const loss = -net;
  if (BigInt(loss) * 5n < BigInt(limit) * 4n) return null;
  const percent = Number((BigInt(loss) * 100n) / BigInt(limit));
  return {
    level: loss >= limit ? "reached" : "approaching",
    loss: MinorUnits.make(loss),
    limit,
    percent,
    remaining: MinorUnits.make(Math.max(0, limit - loss)),
    over: MinorUnits.make(Math.max(0, loss - limit)),
  };
};

export const sessionReminderNotice = (
  startedAt: DateTime.Utc,
  now: DateTime.Utc,
  reminderMinutes: number | null,
): SessionReminderNotice | null => {
  if (reminderMinutes === null || reminderMinutes <= 0) return null;
  const elapsedMs = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(startedAt);
  if (elapsedMs < reminderMinutes * 60_000) return null;
  return {
    minutesPlayed: Math.floor(elapsedMs / 60_000),
    reminderMinutes,
  };
};

export const evaluateLimits = (options: {
  readonly limits: UserLimits;
  readonly currency: CurrencyCode;
  readonly playerId: PlayerId;
  readonly sessions: ReadonlyArray<LimitSessionInput>;
  readonly now: DateTime.Utc;
  readonly local?: LocalSessionOverride;
}): {
  readonly net: MinorUnits;
  readonly lossLimit: LossLimitNotice | null;
  readonly sessionReminder: SessionReminderNotice | null;
} => {
  const net = tripPlayerNet(options.sessions, options.playerId, options.local);
  const applicableLimit =
    options.limits.currency === options.currency ? options.limits.lossLimit : null;
  const lossLimit = lossLimitNotice(net, applicableLimit);

  const activeStarts: Array<DateTime.Utc> = [];
  let seenLocal = false;
  for (const s of options.sessions) {
    if (options.local && s.session.id === options.local.sessionId) {
      seenLocal = true;
      if (options.local.status === "live" && options.local.playing && options.local.myJoinedAt) {
        activeStarts.push(options.local.myJoinedAt);
      }
      continue;
    }
    if (s.session.status === "live" && s.playing.includes(options.playerId) && s.myJoinedAt) {
      activeStarts.push(s.myJoinedAt);
    }
  }
  if (
    options.local &&
    !seenLocal &&
    options.local.status === "live" &&
    options.local.playing &&
    options.local.myJoinedAt
  ) {
    activeStarts.push(options.local.myJoinedAt);
  }

  const earliest = activeStarts.toSorted(
    (a, b) => DateTime.toEpochMillis(a) - DateTime.toEpochMillis(b),
  )[0];
  const sessionReminder = earliest
    ? sessionReminderNotice(earliest, options.now, options.limits.sessionReminderMinutes)
    : null;

  return { net, lossLimit, sessionReminder };
};

export const formatPlayedMinutes = (minutes: number): string => {
  const clamped = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(clamped / 60);
  const rem = clamped % 60;
  if (hours === 0) return `${rem}m`;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
};

export const editableLimitAmount = (
  amount: MinorUnits,
  currency: CurrencyCode,
  locale?: string,
): string => {
  const digits = minorUnitDigits(currency);
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");
  const sign = amount < 0 ? "-" : "";
  if (digits === 0) return `${sign}${magnitude}`;
  const whole = magnitude.slice(0, -digits);
  const fraction = magnitude.slice(-digits);
  if (fraction === "0".repeat(digits)) return `${sign}${whole}`;
  return `${sign}${whole}${decimalSeparator(locale)}${fraction}`;
};

export const exampleLimitAmount = (currency: CurrencyCode): MinorUnits => {
  const digits = minorUnitDigits(currency);
  return MinorUnits.make(digits === 0 ? 50_000 : Number(`500${"0".repeat(digits)}`));
};

import { isHttpClientError } from "effect/http/HttpClientError";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { describeError } from "./errors.ts";

/**
 * What a phone remembers while it removes a deleted account's data, so a killed app finishes the
 * job. It outlives the wipe's own files, and goes last.
 */
export const WipeMarker = Schema.Struct({
  userId: Schema.String,
  /** What the API said; `unknown` when another device deleted the account. */
  status: Schema.Literals(["pending", "complete", "unknown"]),
  /** The Apple sheet was skipped, so the person removes Color Up from their Apple ID by hand. */
  appleManual: Schema.Boolean,
});

export type WipeMarker = typeof WipeMarker.Type;

const MarkerJson = Schema.fromJsonString(WipeMarker);
const decodeMarker = Schema.decodeUnknownOption(MarkerJson);
const encodeMarker = Schema.encodeSync(MarkerJson);

export interface DeviceWipeOptions {
  /** One small file or key that survives until the wipe is finished. */
  readonly marker: {
    readonly read: () => string | null;
    readonly write: (value: string) => void;
    readonly clear: () => void;
  };
  /** In order. Each must be safe to repeat and succeed when what it removes is already gone. */
  readonly steps: ReadonlyArray<(userId: string) => Promise<void> | void>;
}

/**
 * Removes everything the phone kept for an account. `begin` writes the marker before any step
 * runs, `run` finishes every step even when one fails and then reports them, and only `finish`
 * clears the marker, so a wipe cut short at any point picks up from `pending` at the next launch.
 */
export const makeDeviceWipe = ({ marker, steps }: DeviceWipeOptions) => ({
  pending: () => {
    const saved = marker.read();

    return saved === null ? null : Option.getOrNull(decodeMarker(saved));
  },
  begin: (wipe: WipeMarker) => marker.write(encodeMarker(wipe)),
  run: async (wipe: WipeMarker) => {
    const failures: Array<unknown> = [];

    for (const step of steps) {
      try {
        await step(wipe.userId);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) throw new AggregateError(failures, "The device wipe didn't finish");
  },
  finish: () => marker.clear(),
});

/** A failed preview as the sheet shows it: no signal gets its own state, everything else a sentence. */
export const previewFailure = (error: typeof Schema.Unknown.Encoded) => {
  const offline = isHttpClientError(error) && Predicate.isTagged(error.reason, "TransportError");

  return {
    kind: offline ? ("offline" as const) : ("error" as const),
    message: offline
      ? "You're offline. Connect to see what deleting your account changes."
      : describeError(error),
  };
};

export type PreviewFailure = ReturnType<typeof previewFailure>;

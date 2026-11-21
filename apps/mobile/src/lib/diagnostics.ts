import Constants from "expo-constants";
import type { StartupStage } from "@stacks/client-runtime/telemetry";
import { captureStartup, captureCaughtError } from "./telemetry";

interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: Error) => void;
  }) => void;
}

function isRejectionTracker(host: typeof HermesInternal): host is HermesRejectionTracker {
  return host !== null && "enablePromiseRejectionTracker" in host;
}

const environment: string = Constants.expoConfig?.extra?.appVariant ?? "production";
const started = Date.now();
const milestones = new Set<StartupStage>();

export function markStartup(stage: StartupStage) {
  if (milestones.has(stage)) return;
  milestones.add(stage);
  captureStartup(stage, Date.now() - started, environment);
}

export function reportStartupError(error: Error) {
  captureCaughtError(error, [...milestones].at(-1) ?? "js_entry", environment);
}

markStartup("js_entry");

if (!__DEV__ && isRejectionTracker(HermesInternal)) {
  HermesInternal.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => reportStartupError(error),
  });
}

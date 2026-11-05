import Constants from "expo-constants";
import type { StartupStage } from "@stacks/client-runtime/telemetry";
import { captureStartup, captureCaughtError } from "./telemetry";

const environment: string = Constants.expoConfig?.extra?.appVariant ?? "production";
const started = Date.now();
const milestones = new Set<StartupStage>();

export function markStartup(stage: StartupStage) {
  if (milestones.has(stage)) return;
  milestones.add(stage);
  captureStartup(stage, Date.now() - started, environment);
}

export function reportStartupError(error: unknown) {
  captureCaughtError(error, [...milestones].at(-1) ?? "js_entry", environment);
}

markStartup("js_entry");

interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
  }) => void;
}

// React Native installs Hermes rejection tracking only for development LogBox.
if (!__DEV__) {
  const hermes: HermesRejectionTracker | undefined = Reflect.get(globalThis, "HermesInternal");
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => reportStartupError(error),
  });
}

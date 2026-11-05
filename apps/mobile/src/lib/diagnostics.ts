import { Observe } from "expo-observe";
import Constants from "expo-constants";
import type { StartupStage } from "@stacks/client-runtime/telemetry";

const environment: string = Constants.expoConfig?.extra?.appVariant ?? "production";
Observe.configure({ environment });

const started = Date.now();
const milestones = new Set<StartupStage>();
// Defer the secondary SDK until early native reporting is installed and JS entry is recorded.
const telemetry = Promise.resolve()
  .then(() => import("./telemetry"))
  .catch((error: unknown) => {
    Observe.reportError(error);
    return null;
  });

export function markStartup(stage: StartupStage) {
  if (milestones.has(stage)) return;
  milestones.add(stage);
  // Observe persists events on-device, with the native session and release identifiers.
  const elapsedMs = Date.now() - started;
  Observe.logEvent(`startup.${stage}`, {
    severity: stage === "initial_url_timeout" ? "warn" : "info",
    attributes: { elapsed_ms: elapsedMs },
  });
  void telemetry
    .then((client) => client?.captureStartup(stage, elapsedMs, environment))
    .catch((error: unknown) => Observe.reportError(error));
}

export function reportStartupError(error: unknown) {
  Observe.reportError(error);
  const stage = [...milestones].at(-1) ?? "js_entry";
  void telemetry
    .then((client) => client?.captureCaughtError(error, stage, environment))
    .catch((failure: unknown) => Observe.reportError(failure));
}

markStartup("js_entry");

interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
  }) => void;
}

// React Native installs Hermes rejection tracking only for development LogBox; Observe has no hook.
if (!__DEV__) {
  const hermes: HermesRejectionTracker | undefined = Reflect.get(globalThis, "HermesInternal");
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => reportStartupError(error),
  });
}

import { Observe } from "expo-observe";
import Constants from "expo-constants";

Observe.configure({ environment: Constants.expoConfig?.extra?.appVariant ?? "production" });

const started = Date.now();
const milestones = new Set<string>();

export function markStartup(
  stage:
    | "js_entry"
    | "root_committed"
    | "auth_ready"
    | "navigation_ready"
    | "landing_ready"
    | "query_settled",
) {
  if (milestones.has(stage)) return;
  milestones.add(stage);
  // Observe persists events on-device, with the native session and release identifiers.
  Observe.logEvent(`startup.${stage}`, { attributes: { elapsed_ms: Date.now() - started } });
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
    onUnhandled: (_id, error) => Observe.reportError(error),
  });
}

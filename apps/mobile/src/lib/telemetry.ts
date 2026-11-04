import PostHog from "posthog-react-native";
import { sanitizeTelemetry, type TestEvent } from "@stacks/client-runtime/telemetry";

const token = process.env.EXPO_PUBLIC_POSTHOG_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

const posthog =
  token && host
    ? new PostHog(token, {
        host,
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
        disableGeoip: true,
        personProfiles: "never",
        errorTracking: {
          autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false },
          exceptionSteps: { enabled: false },
        },
        before_send: (event) => ({
          ...event,
          properties: sanitizeTelemetry(event.properties ?? {}),
          $set: undefined,
          $set_once: undefined,
        }),
      })
    : null;

export const captureTestEvent = (event: TestEvent) => {
  if (posthog?.isFeatureEnabled("development-test-events")) posthog.capture(event);
};

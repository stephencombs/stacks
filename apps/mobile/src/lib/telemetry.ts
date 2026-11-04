import PostHog from "posthog-react-native";
import { sanitizeTelemetry, type TestEvent } from "@stacks/client-runtime/telemetry";

const token = process.env.EXPO_PUBLIC_POSTHOG_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

const posthog =
  token && host
    ? new PostHog(token, {
        host,
        persistence: "memory",
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
        disableGeoip: true,
        personProfiles: "never",
        logs: { beforeSend: () => null },
        errorTracking: {
          autocapture: { uncaughtExceptions: true, unhandledRejections: false, console: false },
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

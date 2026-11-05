import PostHog from "posthog-react-native";
import {
  sanitizeTelemetry,
  type StartupStage,
  type TestEvent,
} from "@stacks/client-runtime/telemetry";

const token = process.env.EXPO_PUBLIC_POSTHOG_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

const posthog =
  token && host
    ? new PostHog(token, {
        host,
        persistence: "memory",
        flushAt: 1,
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

export const captureStartup = (stage: StartupStage, elapsedMs: number, environment: string) => {
  posthog?.capture("app_startup", {
    startup_stage: stage,
    startup_elapsed_ms: elapsedMs,
    startup_environment: environment,
  });
};

export const captureCaughtError = (error: unknown, stage: StartupStage, environment: string) => {
  posthog?.captureException(error, { startup_stage: stage, startup_environment: environment });
};

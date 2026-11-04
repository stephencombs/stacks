import posthog from "posthog-js";
import { sanitizeTelemetry, type TestEvent } from "@stacks/client-runtime/telemetry";

const token = import.meta.env.VITE_POSTHOG_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;

if (token && host) {
  posthog.init(token, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: true,
    disable_session_recording: true,
    disable_surveys: true,
    enable_heatmaps: false,
    capture_performance: false,
    capture_dead_clicks: false,
    ip: false,
    person_profiles: "never",
    before_send: (event) => ({
      uuid: event.uuid,
      event: event.event,
      properties: sanitizeTelemetry(event.properties),
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    }),
  });
}

export const captureTestEvent = (event: TestEvent) => {
  if (token && host && posthog.isFeatureEnabled("development-test-events")) posthog.capture(event);
};

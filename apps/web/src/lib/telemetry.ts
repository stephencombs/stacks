import posthog, { type PostHogConfig } from "posthog-js";
import { sanitizeTelemetry, type TestEvent } from "@stacks/client-runtime/telemetry";

const token = import.meta.env.VITE_POSTHOG_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;

export const telemetryOptions = {
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  capture_exceptions: true,
  disable_session_recording: true,
  disable_surveys: true,
  enable_heatmaps: false,
  capture_performance: false,
  capture_dead_clicks: false,
  save_referrer: false,
  save_campaign_params: false,
  persistence: "memory",
  disable_product_tours: true,
  disable_conversations: true,
  logs: { beforeSend: () => null },
  person_profiles: "never",
  before_send: (event) => ({
    uuid: event.uuid,
    event: event.event,
    properties: sanitizeTelemetry(event.properties),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
  }),
} satisfies Partial<PostHogConfig>;

if (token && host) {
  posthog.init(token, { ...telemetryOptions, api_host: host });
}

export const captureTestEvent = (event: TestEvent) => {
  if (token && host && posthog.isFeatureEnabled("development-test-events")) posthog.capture(event);
};

export const captureCaughtError = (error: unknown) => {
  if (!token || !host) return;
  try {
    posthog.captureException(error);
  } catch {
    // Reporting must not interfere with the app's error boundary.
  }
};

import type { PostHogConfig } from "posthog-js";
import {
  sanitizeTelemetry,
  scrubTelemetryUrl,
  type TestEvent,
} from "@stacks/client-runtime/telemetry";

const token = import.meta.env.VITE_POSTHOG_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;

function scrubStringProperties(properties: Record<string, unknown>) {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    scrubbed[key] = typeof value === "string" ? scrubTelemetryUrl(value) : value;
  }
  return scrubbed;
}

export const telemetryOptions = {
  autocapture: false,
  // SPA navigations use history, not full page loads.
  capture_pageview: "history_change",
  capture_pageleave: "if_capture_pageview",
  capture_exceptions: true,
  disable_session_recording: true,
  disable_surveys: true,
  enable_heatmaps: false,
  capture_performance: false,
  capture_dead_clicks: false,
  save_referrer: true,
  save_campaign_params: true,
  persistence: "memory",
  disable_product_tours: true,
  disable_conversations: true,
  logs: { beforeSend: () => null },
  person_profiles: "never",
  // Feature-flag requests read initial person props outside before_send.
  loaded: (client) => {
    const persistence = (
      client as { persistence?: { get_initial_props: () => Record<string, unknown> } }
    ).persistence;
    if (!persistence) return;
    const original = persistence.get_initial_props.bind(persistence);
    persistence.get_initial_props = () => scrubStringProperties(original());
  },
  before_send: (event) => ({
    uuid: event.uuid,
    event: event.event,
    properties: sanitizeTelemetry(event.properties),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
  }),
} satisfies Partial<PostHogConfig>;

let posthog: typeof import("posthog-js").default | undefined;
if (token && host) {
  void import("posthog-js")
    .then(({ default: client }) => {
      client.init(token, { ...telemetryOptions, api_host: host });
      posthog = client;
    })
    .catch((error: unknown) => console.error("PostHog initialization failed", error));
}

export const captureTestEvent = (event: TestEvent) => {
  if (posthog?.isFeatureEnabled("development-test-events")) posthog.capture(event);
};

export const captureCaughtError = (error: unknown) => {
  if (!posthog) return;
  try {
    posthog.captureException(error);
  } catch {
    // Reporting must not interfere with the app's error boundary.
  }
};

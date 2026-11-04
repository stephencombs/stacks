// @vitest-environment happy-dom
import { expect, it, vi } from "vite-plus/test";

it("keeps private URLs out of event and feature flag requests", async () => {
  window.history.replaceState({}, "", "/join/private-invite-code?note=private-note");
  Object.defineProperty(document, "referrer", { value: "https://example.test/claim/private-code" });
  const requests: string[] = [];
  let eventSent = () => {};
  const captured = new Promise<void>((resolve) => {
    eventSent = resolve;
  });
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    const body =
      typeof options?.body === "string"
        ? options.body
        : options?.body instanceof Blob
          ? await options.body.text()
          : "";
    requests.push(`${_url} ${body}`);
    if (body.includes("session_start_confirmed")) eventSent();
    return new Response(JSON.stringify({ featureFlags: { "development-test-events": true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  const { default: posthog } = await import("posthog-js");
  const { telemetryOptions } = await import("./telemetry.ts");
  posthog.init("test-token", {
    ...telemetryOptions,
    api_host: "https://posthog.example.test",
    api_transport: "fetch",
    disable_compression: true,
    request_batching: false,
    capture_exceptions: false,
    disable_external_dependency_loading: true,
    opt_out_useragent_filter: true,
  });
  await new Promise<void>((resolve) => posthog.onFeatureFlags(() => resolve()));
  window.history.pushState({}, "", "/claim/another-private-code?note=private-note");
  expect(posthog.isFeatureEnabled("development-test-events")).toBe(true);
  posthog.capture("session_start_confirmed", { note: "private-note" });
  await captured;
  await posthog.featureFlags.reloadFeatureFlagsAsync();
  expect(requests.some((body) => body.includes("session_start_confirmed"))).toBe(true);
  expect(requests.some((body) => body.includes("/flags/"))).toBe(true);
  expect(requests.join("\n")).toContain('"$geoip_disable":true');
  expect(requests.join("\n")).toContain('"$process_person_profile":false');
  expect(requests.join("\n")).not.toMatch(/private-invite-code|private-code|private-note/);
});

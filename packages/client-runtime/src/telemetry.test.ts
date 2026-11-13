import { expect, it } from "@effect/vitest";
import { sanitizeTelemetry, scrubTelemetryUrl } from "./telemetry.ts";

it("keeps startup stages and timings without opening arbitrary telemetry fields", () => {
  expect(
    sanitizeTelemetry({
      startup_stage: "navigation_ready",
      startup_elapsed_ms: 1234,
      startup_environment: "production",
      $app_build: "10",
      note: "private ledger note",
      amount: 5000,
    }),
  ).toEqual({
    startup_stage: "navigation_ready",
    startup_elapsed_ms: 1234,
    startup_environment: "production",
    $app_build: "10",
    $process_person_profile: false,
    $geoip_disable: true,
  });
});

it.each(["query_started", "query_settled"])("keeps the %s stage", (startup_stage) => {
  expect(sanitizeTelemetry({ startup_stage })).toHaveProperty("startup_stage", startup_stage);
});

it("drops arbitrary environment labels", () => {
  expect(sanitizeTelemetry({ startup_environment: "private note" })).not.toHaveProperty(
    "startup_environment",
  );
});

it.each(["private note", "stacks://join/private-code", 123])(
  "rejects arbitrary startup stages (%s)",
  (startup_stage) => {
    expect(sanitizeTelemetry({ startup_stage })).not.toHaveProperty("startup_stage");
  },
);

it.each([NaN, Infinity, -1, "private note", 1.5])(
  "rejects invalid startup timings (%s)",
  (startup_elapsed_ms) => {
    expect(sanitizeTelemetry({ startup_elapsed_ms })).not.toHaveProperty("startup_elapsed_ms");
  },
);

it("keeps scrubbed page URLs and drops ledger details and exception text", () => {
  expect(
    sanitizeTelemetry({
      token: "project-token",
      distinct_id: "device-id",
      $app_version: "1.0",
      $current_url: "https://example.com/join/private-code?note=private-note",
      $pathname: "/join/private-code",
      $referrer: "https://example.test/claim/private-code",
      $utm_source: "newsletter",
      amount: 5000,
      note: "private note",
      $exception_list: [{ type: "Error", value: "private note", stacktrace: "private-code" }],
    }),
  ).toEqual({
    token: "project-token",
    distinct_id: "device-id",
    $app_version: "1.0",
    $current_url: "https://example.com/join/:code",
    $pathname: "/join/:code",
    $referrer: "https://example.test/claim/:code",
    $utm_source: "newsletter",
    $process_person_profile: false,
    $geoip_disable: true,
    $exception_list: [{ type: "Error", value: "Unhandled application error" }],
  });
});

it("redacts invite, claim, and share path secrets", () => {
  expect(scrubTelemetryUrl("/invite/secret-token?x=1")).toBe("/invite/:code");
  expect(scrubTelemetryUrl("/t/share-token#hash")).toBe("/t/:code");
  expect(scrubTelemetryUrl("https://colorup.app/groups/abc")).toBe(
    "https://colorup.app/groups/abc",
  );
});

it("keeps known exception types without forwarding arbitrary error text", () => {
  expect(
    sanitizeTelemetry({ $exception_list: [{ type: "TypeError", value: "private" }] }),
  ).toMatchObject({
    $exception_list: [{ type: "TypeError", value: "Unhandled application error" }],
  });
  expect(sanitizeTelemetry({ $exception_list: [{ type: "private-name" }] })).toMatchObject({
    $exception_list: [{ type: "Error", value: "Unhandled application error" }],
  });
});

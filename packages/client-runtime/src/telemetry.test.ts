import { expect, it } from "@effect/vitest";
import { sanitizeTelemetry } from "./telemetry.ts";

it("keeps startup stages and timings without opening arbitrary telemetry fields", () => {
  expect(
    sanitizeTelemetry({
      startup_stage: "navigation_ready",
      startup_elapsed_ms: 1234,
      startup_environment: "production",
      $app_build: "10",
      note: "private ledger note",
      $current_url: "stacks://join/private-code",
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

it("removes ledger details, URLs, and exception text from telemetry", () => {
  expect(
    sanitizeTelemetry({
      token: "project-token",
      distinct_id: "device-id",
      $app_version: "1.0",
      $current_url: "https://example.com/join/private-code",
      amount: 5000,
      note: "private note",
      $exception_list: [{ type: "Error", value: "private note", stacktrace: "private-code" }],
    }),
  ).toEqual({
    token: "project-token",
    distinct_id: "device-id",
    $app_version: "1.0",
    $process_person_profile: false,
    $geoip_disable: true,
    $exception_list: [{ type: "Error", value: "Unhandled application error" }],
  });
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

import { expect, it } from "@effect/vitest";
import { sanitizeTelemetry } from "./telemetry.ts";

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
    $exception_list: [{ type: "Error", value: "Unhandled application error" }],
  });
});

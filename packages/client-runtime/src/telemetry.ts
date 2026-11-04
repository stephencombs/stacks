export type TestEvent = "session_start_confirmed" | "entry_confirmed" | "session_close_confirmed";

const safeProperties = new Set([
  "token",
  "distinct_id",
  "$lib",
  "$lib_version",
  "$os",
  "$os_version",
  "$app_version",
  "$app_build",
  "$device_type",
  "$feature_flag",
  "$feature_flag_response",
  "$session_id",
]);

export function sanitizeTelemetry(properties: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null | Array<Record<string, string>>> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      safeProperties.has(key) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null)
    ) {
      safe[key] = value;
    }
  }
  if ("$exception_list" in properties) {
    safe.$exception_list = [{ type: "Error", value: "Unhandled application error" }];
  }
  return safe;
}

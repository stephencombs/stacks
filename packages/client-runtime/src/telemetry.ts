export type TestEvent = "session_start_confirmed" | "entry_confirmed" | "session_close_confirmed";

const startupStages = [
  "js_entry",
  "root_committed",
  "auth_ready",
  "navigation_ready",
  "landing_ready",
  "query_started",
  "query_settled",
  "initial_url_timeout",
] as const;
export type StartupStage = (typeof startupStages)[number];
const safeStartupStages = new Set<string>(startupStages);
const safeStartupEnvironments = new Set(["development", "preview", "production"]);

const safeProperties = new Set([
  "token",
  "distinct_id",
  "$lib",
  "$lib_version",
  "$os",
  "$os_version",
  "$browser",
  "$browser_version",
  "$app_version",
  "$app_build",
  "$device_type",
  "$feature_flag",
  "$feature_flag_response",
  "$session_id",
  "$host",
  "$referring_domain",
  "$title",
  "$search_engine",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$pageview_id",
  "$prev_pageview_id",
  "$prev_pageview_duration",
  "$utm_source",
  "$utm_medium",
  "$utm_campaign",
  "$utm_term",
  "$utm_content",
  "$gclid",
  "$gad_source",
  "$gclsrc",
  "$dclid",
  "$wbraid",
  "$gbraid",
  "$fbclid",
  "$msclkid",
  "$twclid",
  "$li_fat_id",
  "$mc_cid",
  "$igshid",
  "$ttclid",
]);

/** Paths that carry invite, claim, or share secrets in the URL. */
const secretPath = /^(\/(?:join|claim|invite|t))\/[^/?#]+/i;
const urlProperties = new Set([
  "$current_url",
  "$pathname",
  "$referrer",
  "$prev_pageview_pathname",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_referrer",
]);

const safeErrorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
]);

function scrubPathname(pathname: string) {
  return pathname.replace(secretPath, "$1/:code");
}

/** Drop query/hash and redact secret path segments so analytics keep shape without codes. */
export function scrubTelemetryUrl(value: string) {
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
      const url = new URL(value);
      url.pathname = scrubPathname(url.pathname);
      url.search = "";
      url.hash = "";
      return url.toString();
    }
  } catch {
    // Fall through and treat it as a path.
  }
  const path = value.split(/[?#]/, 1)[0] ?? value;
  return scrubPathname(path);
}

export function sanitizeTelemetry(properties: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null | Array<Record<string, string>>> = {
    $process_person_profile: false,
    $geoip_disable: true,
  };
  for (const [key, value] of Object.entries(properties)) {
    if (urlProperties.has(key) && typeof value === "string") {
      safe[key] = scrubTelemetryUrl(value);
      continue;
    }
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
  const { startup_stage, startup_elapsed_ms, startup_environment } = properties;
  if (typeof startup_stage === "string" && safeStartupStages.has(startup_stage)) {
    safe.startup_stage = startup_stage;
  }
  if (
    typeof startup_elapsed_ms === "number" &&
    Number.isSafeInteger(startup_elapsed_ms) &&
    startup_elapsed_ms >= 0
  ) {
    safe.startup_elapsed_ms = startup_elapsed_ms;
  }
  if (typeof startup_environment === "string" && safeStartupEnvironments.has(startup_environment)) {
    safe.startup_environment = startup_environment;
  }
  if ("$exception_list" in properties) {
    const exceptions = properties.$exception_list;
    const first = Array.isArray(exceptions) ? exceptions[0] : null;
    const type = first && typeof first === "object" ? first.type : null;
    safe.$exception_list = [
      {
        type: typeof type === "string" && safeErrorTypes.has(type) ? type : "Error",
        value: "Unhandled application error",
      },
    ];
  }
  return safe;
}

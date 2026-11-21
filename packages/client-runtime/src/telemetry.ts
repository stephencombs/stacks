import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export type TestEvent = "session_start_confirmed" | "entry_confirmed" | "session_close_confirmed";

const startupStages = [
  "js_entry",
  "root_committed",
  "auth_ready",
  "navigation_ready",
  "landing_ready",
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
  } catch {}

  const path = value.split(/[?#]/, 1)[0] ?? value;

  return scrubPathname(path);
}

const JsonPrimitive = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]);
const ExceptionItem = Schema.Struct({ type: Schema.optionalKey(Schema.String) });
const StartupStage = Schema.Literals(startupStages);
const StartupElapsed = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const StartupEnvironment = Schema.Literals(["development", "preview", "production"]);

type SanitizedValue = string | number | boolean | null | Array<{ type: string; value: string }>;

export function sanitizeTelemetry<Properties extends Record<string, unknown>>(
  properties: Properties,
) {
  const safe: { [key: string]: SanitizedValue } = {};
  safe.$process_person_profile = false;
  safe.$geoip_disable = true;

  for (const [key, value] of Object.entries(properties)) {
    if (urlProperties.has(key)) {
      const text = Schema.decodeUnknownOption(Schema.String)(value);

      if (Option.isSome(text)) {
        safe[key] = scrubTelemetryUrl(text.value);
        continue;
      }
    }

    if (!safeProperties.has(key)) continue;
    const primitive = Schema.decodeUnknownOption(JsonPrimitive)(value);

    if (Option.isSome(primitive)) safe[key] = primitive.value;
  }

  const stage = Schema.decodeUnknownOption(StartupStage)(properties["startup_stage"]);

  if (Option.isSome(stage) && safeStartupStages.has(stage.value)) safe.startup_stage = stage.value;

  const elapsed = Schema.decodeUnknownOption(StartupElapsed)(properties["startup_elapsed_ms"]);

  if (Option.isSome(elapsed)) safe.startup_elapsed_ms = elapsed.value;

  const environment = Schema.decodeUnknownOption(StartupEnvironment)(
    properties["startup_environment"],
  );

  if (Option.isSome(environment) && safeStartupEnvironments.has(environment.value))
    safe.startup_environment = environment.value;

  if ("$exception_list" in properties) {
    const list = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(
      properties["$exception_list"],
    );

    const head = Option.isSome(list) ? list.value[0] : undefined;

    const item =
      head === undefined ? Option.none() : Schema.decodeUnknownOption(ExceptionItem)(head);

    const type =
      Option.isSome(item) && item.value.type !== undefined && safeErrorTypes.has(item.value.type)
        ? item.value.type
        : "Error";

    safe.$exception_list = [{ type, value: "Unhandled application error" }];
  }

  return safe;
}

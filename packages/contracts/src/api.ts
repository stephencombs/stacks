import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as OpenApi from "effect/http-api/OpenApi";

export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  service: Schema.Literal("stacks-api"),
});
export type HealthResponse = typeof HealthResponse.Type;

const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("health", "/health", {
    success: HealthResponse,
  }).annotate(OpenApi.Summary, "Check API health"),
);

export class StacksApi extends HttpApi.make("stacks").add(HealthGroup).prefix("/api") {}

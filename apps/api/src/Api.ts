import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { StacksApi } from "@stacks/contracts";

const layerHealthApi = HttpApiBuilder.group(StacksApi, "health", (handlers) =>
  handlers.handle("health", () => Effect.succeed({ status: "ok", service: "stacks-api" } as const)),
);

export const layerApi = HttpApiBuilder.layer(StacksApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide(layerHealthApi),
);

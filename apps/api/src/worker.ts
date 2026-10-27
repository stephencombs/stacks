import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";

import { layerApi } from "./Api.ts";

// Workers have no filesystem; the API never serves files.
const layerWorkerPlatform = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
  Path.layer,
  Etag.layerWeak,
);

const { handler } = HttpRouter.toWebHandler(
  Layer.mergeAll(layerApi, HttpRouter.cors()).pipe(Layer.provide(layerWorkerPlatform)),
);

export default {
  fetch: (request) => handler(request),
} satisfies ExportedHandler;

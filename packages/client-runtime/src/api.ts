import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi";
import { StacksApi } from "@stacks/contracts";

/**
 * Each app builds one client at startup: web passes "" (same origin, proxied in dev),
 * mobile passes the API origin from its config.
 */
export const makeStacksClient = (baseUrl: string) => {
  class StacksClient extends AtomHttpApi.Service<StacksClient>()("@stacks/StacksClient", {
    api: StacksApi,
    httpClient: FetchHttpClient.layer,
    baseUrl,
  }) {}
  return StacksClient;
};

export type StacksClient = ReturnType<typeof makeStacksClient>;

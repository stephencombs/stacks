import { makeScopeWatchable } from "@stacks/client-runtime/api";
import { createScopeHub, type ScopeHubOptions } from "@stacks/client-runtime/realtime";

import { apiUrl } from "./config";
import { installOrigin } from "./origin";
import { appStateSource, openSocket } from "./realtime";

export const createHub = (options: Pick<ScopeHubOptions, "authorization" | "watchable">) =>
  createScopeHub({
    baseUrl: apiUrl,
    origin: installOrigin,
    openSocket,
    appState: appStateSource,
    ...options,
  });

export const rootHubFor = (authorization: () => Promise<string | null>) =>
  createHub({ authorization, watchable: makeScopeWatchable({ baseUrl: apiUrl, authorization }) });

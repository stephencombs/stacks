import type { ScopeId } from "@stacks/contracts";

import type { NoticeRefresh } from "./noticeRefresh.ts";
import type { ScopeHub } from "./realtime.ts";

/**
 * Keeps a screen's sockets matched to the scopes it shows. `set` opens the ones it's missing and
 * closes the ones it dropped, so a scope that stays keeps its socket; `set([])` stops watching. A
 * socket opening is a reason to refetch like a notice, so sockets opening together share one.
 */
export const watchScopes = (hub: ScopeHub, refresh: NoticeRefresh) => {
  const held = new Map<ScopeId, () => void>();
  const listener = { notice: refresh.notice, connected: refresh.notice };

  return {
    set: (scopes: ReadonlyArray<ScopeId>) => {
      const wanted = new Set(scopes);

      for (const [scope, release] of held) {
        if (!wanted.has(scope)) {
          release();
          held.delete(scope);
        }
      }

      for (const scope of wanted) {
        if (!held.has(scope)) held.set(scope, hub.watch(scope, listener));
      }
    },
  };
};

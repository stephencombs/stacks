import { RegistryContext } from "@effect/atom-react";
import { ScopeId } from "@stacks/contracts";
import type * as Atom from "effect/reactivity/Atom";
import type * as AsyncResult from "effect/reactivity/AsyncResult";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { createNoticeRefresh, registryTarget, type NoticeRefresh } from "./noticeRefresh.ts";
import type { ScopeHub } from "./realtime.ts";

/** The signed-in user's connections, or null while nobody is signed in. */
export const ScopeHubContext = createContext<ScopeHub | null>(null);

const NoticeRefreshContext = createContext<NoticeRefresh | null>(null);

/**
 * Watches scopes while `enabled`, and refetches the queries registered under the returned
 * handle when one of them changes. Pass `enabled` false when the screen isn't the one in front.
 */
export function useScopeNotices(scopes: ReadonlyArray<ScopeId>, enabled: boolean) {
  const hub = use(ScopeHubContext);
  const [refresh] = useState(() => createNoticeRefresh());
  const key = scopes.join(",");

  useEffect(() => {
    if (!hub || !enabled || key === "") return;
    const listener = { notice: refresh.notice, connected: refresh.catchUp };
    const releases = key.split(",").map((scope) => hub.watch(ScopeId.make(scope), listener));

    return () => {
      for (const release of releases) release();
    };
  }, [hub, enabled, key, refresh]);

  return refresh;
}

/** A screen's scopes: the queries shown under it refetch when something in them changes. */
export function ScopeNotices({
  scopes,
  enabled,
  children,
}: {
  scopes: ReadonlyArray<ScopeId>;
  enabled: boolean;
  children: ReactNode;
}) {
  const refresh = useScopeNotices(scopes, enabled);

  return <NoticeRefreshContext value={refresh}>{children}</NoticeRefreshContext>;
}

/** Puts a shown query among those the nearest `ScopeNotices` refetches. */
export function useNoticeTarget<A, E>(query: Atom.Atom<AsyncResult.AsyncResult<A, E>>) {
  const refresh = use(NoticeRefreshContext);
  const registry = use(RegistryContext);

  useEffect(
    () => (refresh ? refresh.register(registryTarget(registry, query)) : undefined),
    [refresh, registry, query],
  );
}

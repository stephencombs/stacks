import { RegistryContext } from "@effect/atom-react";
import { ScopeId } from "@stacks/contracts";
import type * as Atom from "effect/reactivity/Atom";
import type * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createNoticeRefresh,
  registryTarget,
  type NoticeRefresh,
  type RefreshTarget,
} from "./noticeRefresh.ts";
import type { ScopeHub } from "./realtime.ts";
import { watchScopes } from "./screenNotices.ts";

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
  const watching = useMemo(() => (hub ? watchScopes(hub, refresh) : null), [hub, refresh]);
  const key = scopes.join(",");

  useEffect(() => () => watching?.set([]), [watching]);

  useEffect(() => {
    watching?.set(enabled && key !== "" ? key.split(",").map((scope) => ScopeId.make(scope)) : []);
  }, [watching, enabled, key]);

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

/**
 * Gives what's below it a hub made by `make`, and a new one when `make` changes. The one it
 * replaces is disposed once it goes, a moment later so a remount that comes straight back keeps
 * its sockets. `make` must be stable.
 */
export function ScopeHubProvider({
  make,
  children,
}: {
  make: () => ScopeHub;
  children: ReactNode;
}) {
  const [held, setHeld] = useState(() => ({ make, hub: make() }));

  if (held.make !== make) setHeld({ make, hub: make() });
  const leaving = useRef<{ hub: ScopeHub; timer: ReturnType<typeof setTimeout> } | null>(null);
  const { hub } = held;

  useEffect(() => {
    if (leaving.current?.hub === hub) {
      clearTimeout(leaving.current.timer);
      leaving.current = null;
    }

    return () => {
      leaving.current = { hub, timer: setTimeout(() => hub.dispose(), 500) };
    };
  }, [hub]);

  return <ScopeHubContext value={hub}>{children}</ScopeHubContext>;
}

/**
 * The one hub for every screen that isn't a share link: `bearer` while someone is signed in,
 * `actor` (the device's own credential) otherwise. It's made again when who is signed in
 * changes, so its sockets reconnect with the new credential: a signed-out account's session is
 * gone, and a device actor becomes the account's on sign-in and its old secret stops working.
 * `make` must be stable.
 */
export function RootScopeHub({
  userId,
  bearer,
  actor,
  make,
  children,
}: {
  userId: string | null;
  bearer: () => Promise<string | null>;
  actor: () => Promise<string | null>;
  make: (authorization: () => Promise<string | null>) => ScopeHub;
  children: ReactNode;
}) {
  const build = useCallback(
    () => make(userId === null ? actor : bearer),
    [make, userId, bearer, actor],
  );

  return <ScopeHubProvider make={build}>{children}</ScopeHubProvider>;
}

/** Puts a refetch of your own among those the nearest `ScopeNotices` runs. */
export function useNoticeRefresh(target: RefreshTarget) {
  const refresh = use(NoticeRefreshContext);

  useEffect(() => refresh?.register(target), [refresh, target]);
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

import {
  createScopeHub,
  type ScopeHub,
  type ScopeHubOptions,
} from "@stacks/client-runtime/realtime";
import { ScopeHubContext } from "@stacks/client-runtime/realtimeReact";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/**
 * Gives what's below it a hub made for `make` and disposed once it goes. `make` must be stable.
 * Disposal waits a moment, so a remount that comes straight back keeps its sockets.
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
  const timers = useRef(new Map<ScopeHub, ReturnType<typeof setTimeout>>());
  const { hub } = held;

  useEffect(() => {
    clearTimeout(timers.current.get(hub));

    return () => {
      timers.current.set(
        hub,
        setTimeout(() => hub.dispose(), 500),
      );
    };
  }, [hub]);

  return <ScopeHubContext value={hub}>{children}</ScopeHubContext>;
}

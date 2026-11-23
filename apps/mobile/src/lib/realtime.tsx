import { useIsFocused } from "@react-navigation/native";
import type { ScopeId } from "@stacks/contracts";
import type { AppStateSource, OpenSocket } from "@stacks/client-runtime/realtime";
import { ScopeNotices as ScopeNoticesFor } from "@stacks/client-runtime/realtimeReact";
import type { ReactNode } from "react";
import { AppState } from "react-native";

type HeaderSocket = new (
  url: string,
  protocols: undefined,
  options: { readonly headers: { readonly authorization: string } },
) => WebSocket;

const ReactNativeWebSocket: HeaderSocket = WebSocket;

export const openSocket: OpenSocket = (url, headers, handlers) => {
  const socket = new ReactNativeWebSocket(url, undefined, { headers });
  socket.addEventListener("open", () => handlers.open());
  socket.addEventListener("message", ({ data }) => handlers.message(String(data)));
  socket.addEventListener("close", ({ code }) => handlers.close(code));

  return { send: (data) => socket.send(data), close: () => socket.close() };
};

const nameOf = (state: string | null | undefined) =>
  state === "active" || state === "background" ? state : "inactive";

export const appStateSource: AppStateSource = {
  current: () => nameOf(AppState.currentState),
  subscribe: (listener) => {
    const subscription = AppState.addEventListener("change", (state) => listener(nameOf(state)));

    return () => subscription.remove();
  },
};

/**
 * The scopes a screen shows, watched only while it's the one in front. Queries shown under it
 * refetch when something in those scopes changes.
 */
export function ScopeNotices({
  scopes,
  children,
}: {
  scopes: ReadonlyArray<ScopeId>;
  children: ReactNode;
}) {
  return (
    <ScopeNoticesFor scopes={scopes} enabled={useIsFocused()}>
      {children}
    </ScopeNoticesFor>
  );
}

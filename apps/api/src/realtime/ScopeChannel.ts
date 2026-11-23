import { DurableObject } from "cloudflare:workers";
import { MAX_SCOPE_SOCKETS, SCOPE_PING, SCOPE_PONG, type ScopeNotice } from "@stacks/contracts";

/**
 * Everyone watching one scope. It keeps no state and runs no timers, alarms or outbound fetches,
 * so it hibernates between notices; `ping` is answered by the runtime without waking it.
 */
export class ScopeChannel extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(SCOPE_PING, SCOPE_PONG));
  }

  protected sockets() {
    const sockets: ReadonlyArray<Pick<WebSocket, "send" | "close">> = this.ctx.getWebSockets();

    return sockets;
  }

  override fetch(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }

    if (this.sockets().length >= MAX_SCOPE_SOCKETS) {
      return new Response("Too many connections", { status: 503 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called over RPC after a write commits. A socket that can't be sent to doesn't stop the rest. */
  notify(notice: ScopeNotice) {
    const message = JSON.stringify(notice);

    for (const socket of this.sockets()) {
      try {
        socket.send(message);
      } catch {
        try {
          socket.close(1011, "send failed");
        } catch {}
      }
    }
  }

  override webSocketMessage() {}
}

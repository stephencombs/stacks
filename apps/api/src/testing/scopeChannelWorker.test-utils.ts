import { ScopeId } from "@stacks/contracts";

import { ScopeChannel } from "../realtime/ScopeChannel.ts";
import type { Selector } from "../realtime/Selector.ts";
import worker from "../worker.ts";

const unsendable = {
  send: () => {
    throw new Error("socket is gone");
  },
  close: () => {
    throw new Error("socket is gone");
  },
};

/** The real channel, plus counters the smoke test reads to tell whether the object woke up. */
export class ProbedScopeChannel extends ScopeChannel {
  #poisoned = false;
  #handled = 0;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.storage.kv.put("wakes", (ctx.storage.kv.get<number>("wakes") ?? 0) + 1);
  }

  protected override sockets(tag?: string) {
    return this.#poisoned ? [...super.sockets(tag), unsendable] : super.sockets(tag);
  }

  override webSocketMessage() {
    this.#handled += 1;
  }

  poison() {
    this.#poisoned = true;
  }

  probe() {
    return { wakes: this.ctx.storage.kv.get<number>("wakes") ?? 0, handled: this.#handled };
  }
}

interface Env {
  readonly HYPERDRIVE: Hyperdrive;
  readonly SCOPE_CHANNEL: DurableObjectNamespace<ProbedScopeChannel>;
}

export default {
  fetch: async (request, env, ctx) => {
    const [, prefix, verb, scope] = new URL(request.url).pathname.split("/");

    if (prefix !== "_probe") return worker.fetch(request, env, ctx);
    const channel = env.SCOPE_CHANNEL.getByName(scope!);

    switch (verb) {
      case "ws":
        return channel.fetch(request);
      case "notify":
        await channel.notify({ scope: ScopeId.make(scope!), origin: null });

        return new Response(null, { status: 204 });
      case "close": {
        const { selector, code }: { selector: Selector; code: number } = await request.json();
        await channel.close(selector, code);

        return new Response(null, { status: 204 });
      }

      case "poison":
        await channel.poison();

        return new Response(null, { status: 204 });
      default:
        return Response.json(await channel.probe());
    }
  },
} satisfies ExportedHandler<Env>;

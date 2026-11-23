import { ScopeId } from "@stacks/contracts";

import { ScopeChannel } from "../realtime/ScopeChannel.ts";

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

  protected override sockets() {
    return this.#poisoned ? [...super.sockets(), unsendable] : super.sockets();
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
  readonly SCOPE_CHANNEL: DurableObjectNamespace<ProbedScopeChannel>;
}

export default {
  fetch: async (request, env) => {
    const [, verb, scope] = new URL(request.url).pathname.split("/");
    const channel = env.SCOPE_CHANNEL.getByName(scope!);

    switch (verb) {
      case "ws":
        return channel.fetch(request);
      case "notify":
        await channel.notify({ scope: ScopeId.make(scope!), origin: null });

        return new Response(null, { status: 204 });
      case "poison":
        await channel.poison();

        return new Response(null, { status: 204 });
      default:
        return Response.json(await channel.probe());
    }
  },
} satisfies ExportedHandler<Env>;

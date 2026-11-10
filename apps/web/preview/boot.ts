// Preview only: answers /api from fixtures after a delay (?delay=ms), then opens ?path= in the real app.
import { routes } from "./fixtures";

const params = new URLSearchParams(location.search);
const delay = Number(params.get("delay") ?? 300);
const path = params.get("path");
if (path) history.replaceState(null, "", path);
const realFetch = window.fetch.bind(window);
// What this preview session pushed and joined, so the next pull returns it like the server would.
const pushed: unknown[] = [];
let joined: { table: unknown; player: unknown } | null = null;
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  // Recording pushes are accepted, or refused with ?sync=refuse to show what a refusal looks like.
  const request = async <A>() =>
    (await new Response(input instanceof Request ? input.clone().body : init?.body).json()) as A;
  const recording = routes["/api/recording"] as Record<string, unknown>;
  const body =
    url.pathname === "/api/recording/commands"
      ? {
          results: (
            await request<{ commands: { operationId: string; actorId: string }[] }>()
          ).commands.map((command) => {
            if (params.get("sync") === "refuse")
              return {
                operationId: command.operationId,
                status: "rejected",
                reason: "conflict",
                message: "",
              };
            pushed.push(command);
            return { operationId: command.operationId, status: "accepted" };
          }),
        }
      : url.pathname === "/api/recording"
        ? {
            ...recording,
            commands: pushed,
            tables: joined ? [joined.table] : [],
            participants: joined
              ? [{ tableId: (joined.table as { id: string }).id, player: joined.player }]
              : [],
          }
        : url.pathname.endsWith("/join") && routes[url.pathname]
          ? (joined = routes[url.pathname] as typeof joined)
          : routes[url.pathname];
  // Stagger dependent queries a little, like a real network.
  await new Promise((r) =>
    setTimeout(r, delay + (url.pathname.endsWith("/limits") ? delay / 2 : 0)),
  );
  if (body === undefined)
    return new Response(JSON.stringify({ _tag: "NotFound" }), { status: 404 });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
await import("~/main");

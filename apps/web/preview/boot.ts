// Preview only: answers /api from fixtures after a delay (?delay=ms), then opens ?path= in the real app.
import { routes } from "./fixtures";

const params = new URLSearchParams(location.search);
const delay = Number(params.get("delay") ?? 300);
const path = params.get("path");
if (path) history.replaceState(null, "", path);
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  const body = routes[url.pathname];
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

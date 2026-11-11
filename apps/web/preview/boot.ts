// Preview only: answers /api from fixtures after a delay (?delay=ms), then opens ?path= in the real app.
import { routes } from "./fixtures";

const params = new URLSearchParams(location.search);
const delay = Number(params.get("delay") ?? 300);
const path = params.get("path");
sessionStorage.setItem("preview-signed-out", params.get("signedOut") === "1" ? "1" : "0");
if (path) history.replaceState(null, "", path);
const realFetch = window.fetch.bind(window);
// What this preview session pushed and joined, so the next pull returns it like the server would.
const pushed: unknown[] = [];
let joined: { table: unknown; player: unknown } | null = null;
type Pushed = {
  type: string;
  tableId?: string;
  playerId?: string;
  newPlayer?: { id: string; displayName: string };
};
// The starter's own tables, invites and recorders, made up from what this session pushed. Every
// player added here counts as having an account, so the Recorders list has someone in it.
const starterAnswer = (pathname: string) => {
  const commands = pushed as Pushed[];
  const added = commands.flatMap((command) => (command.newPlayer ? [command.newPlayer] : []));
  const table = pathname.match(/^\/api\/tables\/([^/]+)$/)?.[1];
  if (table) {
    const start = commands.find((command) => command.tableId === table && command.type === "start");
    if (!start) return undefined;
    const recorders = new Set<string>();
    for (const command of commands)
      if (command.tableId === table && command.playerId)
        if (command.type === "appoint_recorder") recorders.add(command.playerId);
        else if (command.type === "revoke_recorder") recorders.delete(command.playerId);
    return {
      table: {
        id: table,
        tripId: null,
        game: null,
        venueId: null,
        highLimit: false,
        starterPlayerId: start.playerId,
      },
      players: added,
      visits: [],
      viewerRole: "starter",
      viewerPlayerId: start.playerId,
      recorders: [...recorders],
      appointable: added.map((player) => player.id),
      shared: true,
    };
  }
  const player = pathname.match(/^\/api\/players\/([^/]+)\/(invites|access)$/);
  if (player?.[2] === "invites")
    return { id: "0192e7a0-0000-7000-8000-000000000990", token: "preview-invite" };
  if (player)
    return {
      player: added.find((item) => item.id === player[1]) ?? { id: player[1], displayName: "Bea" },
      invite: null,
      devices: [],
    };
  return undefined;
};
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
  // Signing in on a device that synced as itself claims what it holds: ?claim=refused refuses a
  // player another account has, and ?claim=separate refuses until the person asks to link.
  const claim = async () => {
    const bea = { id: "0192e7a0-0000-7000-8000-000000000a01", displayName: "Bea" };
    const cal = { id: "0192e7a0-0000-7000-8000-000000000a02", displayName: "Cal" };
    if (params.get("claim") === "separate" && !(await request<{ link?: boolean }>()).link)
      return { _tag: "Conflict", reason: "recording_identity" };
    return {
      adopted: false,
      claimed: [bea],
      refused: params.get("claim") === "refused" ? [cal] : [],
    };
  };
  const body =
    url.pathname === "/api/recording/claim"
      ? await claim()
      : url.pathname === "/api/recording/commands"
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
            : (routes[url.pathname] ?? starterAnswer(url.pathname));
  // Stagger dependent queries a little, like a real network.
  await new Promise((r) =>
    setTimeout(r, delay + (url.pathname.endsWith("/limits") ? delay / 2 : 0)),
  );
  if (body === undefined)
    return new Response(JSON.stringify({ _tag: "NotFound" }), { status: 404 });
  return new Response(JSON.stringify(body), {
    status: (body as { _tag?: string })._tag === "Conflict" ? 409 : 200,
    headers: { "content-type": "application/json" },
  });
};
await import("~/main");

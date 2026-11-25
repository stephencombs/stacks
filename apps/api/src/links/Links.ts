import { CARDS } from "./cards.ts";

/** One build's link host, as the Worker var `LINK_SITES` lists it. */
export interface LinkSite {
  readonly host: string;
  readonly scheme: string;
  readonly appleAppId: string;
  readonly androidPackage: string;
  readonly androidSha256: ReadonlyArray<string>;
}

const KINDS = {
  "/t": {
    card: "table",
    title: "Join a table on Color Up",
    description: "Follow a live table and record your play.",
  },
  "/invite": {
    card: "invite",
    title: "Record your play on Color Up",
    description: "You're invited to record as a player at a table.",
  },
  "/join": {
    card: "join",
    title: "Join a group on Color Up",
    description: "Keep one shared ledger with your friends.",
  },
  "/claim": {
    card: "claim",
    title: "Claim your history on Color Up",
    description: "Take over the play recorded under your name.",
  },
} as const;

const AASA = "/.well-known/apple-app-site-association";
const ASSETLINKS = "/.well-known/assetlinks.json";

const png = (card: keyof typeof CARDS) =>
  Uint8Array.from(atob(CARDS[card]), (c) => c.charCodeAt(0));

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const json = (body: string) =>
  new Response(body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });

const associationFile = (site: LinkSite) =>
  json(
    JSON.stringify({
      applinks: {
        details: [
          {
            appIDs: [site.appleAppId],
            components: Object.keys(KINDS).map((path) => ({ "/": path })),
          },
        ],
      },
    }),
  );

const assetLinks = (site: LinkSite) =>
  json(
    JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: site.androidPackage,
          sha256_cert_fingerprints: site.androidSha256,
        },
      },
    ]),
  );

const OPEN = `const token = location.hash.slice(1);
const button = document.getElementById("open");
if (token) {
  button.href = button.dataset.scheme + "://" + button.dataset.path + "/" + encodeURIComponent(token);
  button.hidden = false;
}`;

const STYLE = `:root { color-scheme: light dark; --felt: oklch(0.515 0.113 155.3); --ink: oklch(0.179 0.006 285.8); --canvas: oklch(0.962 0.005 286.3); --muted: oklch(0.485 0.013 285.9); }
@media (prefers-color-scheme: dark) { :root { --ink: oklch(0.96 0.005 286.3); --canvas: oklch(0.179 0.006 285.8); --muted: oklch(0.72 0.012 286.1); } }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: var(--canvas); color: var(--ink); font: 17px/1.45 system-ui, sans-serif; }
main { max-width: 420px; text-align: center; }
h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; }
p { margin: 0 0 24px; color: var(--muted); }
.open { display: inline-block; padding: 14px 28px; border-radius: 14px; background: var(--felt); color: white; font-weight: 600; text-decoration: none; }
.open[hidden] { display: none; }
.stores { margin-top: 32px; font-size: 14px; }`;

const page = (path: keyof typeof KINDS, site: LinkSite, nonce: string) => {
  const { card, title, description } = KINDS[path];
  const origin = `https://${site.host}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Color Up">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${origin}${path}">
<meta property="og:image" content="${origin}/og/${card}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<h1>${escape(title)}</h1>
<p>${escape(description)}</p>
<a id="open" class="open" hidden data-scheme="${escape(site.scheme)}" data-path="${path.slice(1)}" href="#">Open in Color Up</a>
<p class="stores">Get Color Up: App Store and Google Play, coming soon.</p>
</main>
<script nonce="${nonce}">${OPEN}</script>
</body>
</html>`;
};

const pageHeaders = (nonce: string) => ({
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "referrer-policy": "no-referrer",
  "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
});

const isKind = (path: string): path is keyof typeof KINDS => Object.hasOwn(KINDS, path);

const isCard = (name: string | undefined): name is keyof typeof CARDS =>
  name !== undefined && Object.hasOwn(CARDS, name);

const routeFor = (pathname: string, site: LinkSite) => {
  if (pathname === AASA) return () => associationFile(site);

  if (pathname === ASSETLINKS) return () => assetLinks(site);

  const card = /^\/og\/(\w+)\.png$/.exec(pathname)?.[1];

  if (isCard(card))
    return () =>
      new Response(png(card), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" },
      });

  if (isKind(pathname))
    return () => {
      const nonce = crypto.randomUUID();

      return new Response(page(pathname, site, nonce), { headers: pageHeaders(nonce) });
    };

  return null;
};

/**
 * Answers the link routes of a configured host, or returns `null` so the request goes on to the
 * API. It reads no database and sees no fragment, so no token ever reaches it.
 */
export const respond = (request: Request, sites: ReadonlyArray<LinkSite> | undefined) => {
  const { hostname, pathname } = new URL(request.url);
  const site = sites?.find((candidate) => candidate.host.toLowerCase() === hostname.toLowerCase());
  const route = site ? routeFor(pathname, site) : null;

  if (!route) return null;

  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });

  const response = route();

  return request.method === "HEAD" ? new Response(null, response) : response;
};

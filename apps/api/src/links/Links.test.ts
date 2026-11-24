import { describe, expect, it } from "@effect/vitest";

import { respond, type LinkSite } from "./Links.ts";

const site: LinkSite = {
  host: "preview.colorup.test",
  scheme: "stacks-preview",
  appleAppId: "TEAMID1234.com.example.colorup.preview",
  androidPackage: "com.example.colorup.preview",
  androidSha256: ["AA:BB:CC", "DD:EE:FF"],
};

const get = (path: string, init?: RequestInit, host = site.host) =>
  respond(new Request(`https://${host}${path}`, init), [site]);

const PAGES = ["/t", "/invite", "/join", "/claim"];

describe("with no link host configured", () => {
  it.each([undefined, []])("serves nothing (%j)", (sites) => {
    for (const path of [
      ...PAGES,
      "/.well-known/apple-app-site-association",
      "/.well-known/assetlinks.json",
      "/og/table.png",
    ])
      expect(respond(new Request(`https://preview.colorup.test${path}`), sites)).toBeNull();
  });
});

describe("with a link host configured", () => {
  it("leaves other hosts and other paths to the API", () => {
    expect(get("/t", undefined, "colorup.stephen-jcombs.workers.dev")).toBeNull();
    expect(get("/api/groups")).toBeNull();
    expect(get("/")).toBeNull();
    expect(get("/t/some-token")).toBeNull();
    expect(get("/og/missing.png")).toBeNull();
    expect(get("/og/toString.png")).toBeNull();
  });

  it("matches the host without regard to case", () => {
    expect(get("/t", undefined, "PREVIEW.ColorUp.test")?.status).toBe(200);
  });

  it("lists the four link paths and this build's app in the Apple association file", async () => {
    const response = get("/.well-known/apple-app-site-association")!;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["TEAMID1234.com.example.colorup.preview"],
            components: [{ "/": "/t" }, { "/": "/invite" }, { "/": "/join" }, { "/": "/claim" }],
          },
        ],
      },
    });
  });

  it("lists this build's package and fingerprints in assetlinks.json", async () => {
    const response = get("/.well-known/assetlinks.json")!;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.example.colorup.preview",
          sha256_cert_fingerprints: ["AA:BB:CC", "DD:EE:FF"],
        },
      },
    ]);
  });

  it("keeps two hosts apart", async () => {
    const production: LinkSite = {
      ...site,
      host: "colorup.test",
      appleAppId: "TEAMID1234.com.example.colorup",
      androidPackage: "com.example.colorup",
    };

    const sites = [site, production];

    const ask = (host: string, path: string) =>
      respond(new Request(`https://${host}${path}`), sites)!.text();

    const apple = await ask("colorup.test", "/.well-known/apple-app-site-association");
    const android = await ask("colorup.test", "/.well-known/assetlinks.json");

    expect(apple).toContain('"TEAMID1234.com.example.colorup"');
    expect(apple).not.toContain("preview");
    expect(android).toContain('"com.example.colorup"');
    expect(android).not.toContain("preview");
  });

  it.each(PAGES)("serves %s as a private page with a strict policy", async (path) => {
    const response = get(path)!;
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");

    const policy = response.headers.get("content-security-policy")!;
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)![1]!;

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe");
    expect(body.match(/<script nonce="([^"]+)">/)![1]).toBe(nonce);
    expect(body).toContain(`<meta property="og:image" content="https://${site.host}/og/`);
    expect(body).toContain("Open in Color Up");
    expect(body).toContain("coming soon");
    expect(body).toContain(`data-scheme="stacks-preview" data-path="${path.slice(1)}"`);
  });

  it("describes each kind of link in its own words", async () => {
    const titles = await Promise.all(
      PAGES.map(async (path) => /<title>(.*)<\/title>/.exec(await get(path)!.text())![1]),
    );

    expect(titles).toEqual([
      "Join a table on Color Up",
      "Record your play on Color Up",
      "Join a group on Color Up",
      "Claim your history on Color Up",
    ]);
  });

  it.each(PAGES)("never puts a token or a name in %s", async (path) => {
    const secret = "tok_SECRET123";
    const name = "Vegas Weekend Alex";

    const asked = await get(`${path}?token=${secret}&name=${encodeURIComponent(name)}`, {
      headers: { referer: `https://elsewhere.test/${secret}`, "x-name": name },
    })!.text();

    expect(asked).not.toContain(secret);
    expect(asked).not.toContain(name);
    expect(asked).not.toContain("Alex");
  });

  it("builds the app link from the fragment in the browser, not on the server", async () => {
    const body = await get("/t")!.text();

    expect(body).toContain("location.hash");
    expect(body).toContain('id="open" class="open" hidden');
  });

  it("answers HEAD with the headers and no body", async () => {
    const response = get("/invite", { method: "HEAD" })!;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(get("/.well-known/assetlinks.json", { method: "HEAD" })!.status).toBe(200);
  });

  it("refuses to write", () => {
    const response = get("/t", { method: "POST" })!;

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it.each(["table", "invite", "join", "claim"])(
    "serves the %s card as a 1200 by 630 PNG",
    async (card) => {
      const response = get(`/og/${card}.png`)!;
      const bytes = new DataView(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toContain("max-age=");
      expect(response.headers.get("cache-control")).not.toContain("no-store");
      expect(bytes.getUint32(0)).toBe(0x89504e47);
      expect(bytes.getUint32(16)).toBe(1200);
      expect(bytes.getUint32(20)).toBe(630);
      expect(get(`/og/${card}.png`, { method: "HEAD" })!.status).toBe(200);
    },
  );
});

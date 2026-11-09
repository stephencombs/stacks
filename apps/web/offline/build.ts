import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite-plus";

const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

export function renderAppShell(entries: { fileName: string; source: string | Uint8Array }[]) {
  const assets = entries
    .filter(
      ({ fileName }) =>
        fileName === "index.html" ||
        (fileName.startsWith("assets/") && /\.(?:js|css|woff2?|ttf|otf)$/.test(fileName)),
    )
    .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  if (!assets.some(({ fileName }) => fileName === "index.html")) {
    throw new Error("Offline app shell needs the production index.html");
  }
  const hash = createHash("sha256").update(worker);
  for (const asset of assets)
    hash.update(asset.fileName).update("\0").update(asset.source).update("\0");
  const manifest = {
    cacheName: `color-up-shell-v1-${hash.digest("hex").slice(0, 24)}`,
    assets: assets.map(({ fileName }) => `/${fileName}`),
    integrity: Object.fromEntries(
      assets.map(({ fileName, source }) => [
        `/${fileName}`,
        `sha256-${createHash("sha256").update(source).digest("base64")}`,
      ]),
    ),
  };
  return worker.replace('"__COLOR_UP_SHELL_MANIFEST__"', JSON.stringify(JSON.stringify(manifest)));
}

export function offlineAppShell(): Plugin {
  let enabled = false;
  return {
    name: "color-up-offline-shell",
    apply: "build",
    enforce: "post",
    config(_config, env) {
      enabled = env.mode === "production";
      if (!enabled) return;
      return { define: { "import.meta.env.COLOR_UP_OFFLINE_SHELL": JSON.stringify("enabled") } };
    },
    generateBundle: {
      // Vite rewrites chunk imports and preloads during its normal generateBundle hooks.
      order: "post",
      handler(_options, bundle) {
        if (!enabled) return;
        const entries = Object.values(bundle).map((entry) => ({
          fileName: entry.fileName,
          source: entry.type === "chunk" ? entry.code : entry.source,
        }));
        this.emitFile({ type: "asset", fileName: "sw.js", source: renderAppShell(entries) });
      },
    },
  };
}

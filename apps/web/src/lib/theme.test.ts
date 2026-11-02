import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vite-plus/test";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;

it.each([
  { saved: "light", systemLight: false, theme: "light", chrome: "#f2f3f6" },
  { saved: "system", systemLight: true, theme: "light", chrome: "#f2f3f6" },
  { saved: "system", systemLight: false, theme: undefined, chrome: "#090b0f" },
  { saved: "dark", systemLight: true, theme: undefined, chrome: "#090b0f" },
  { saved: null, systemLight: true, theme: undefined, chrome: "#090b0f" },
])(
  "restores $saved with system light=$systemLight before paint",
  ({ saved, systemLight, theme, chrome }) => {
    const dataset: Record<string, string> = {};
    const meta = { content: "#090b0f" };
    runInNewContext(script, {
      localStorage: { getItem: () => saved },
      matchMedia: () => ({ matches: systemLight }),
      document: {
        documentElement: { dataset },
        querySelector: () => meta,
      },
    });
    expect(dataset.theme).toBe(theme);
    expect(meta.content).toBe(chrome);
  },
);

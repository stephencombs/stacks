import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vite-plus/test";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;

it.each([
  { saved: null, systemDark: false, theme: undefined, chrome: "#f2f2f6" },
  { saved: null, systemDark: true, theme: "dark", chrome: "#000000" },
  { saved: "system", systemDark: true, theme: "dark", chrome: "#000000" },
  { saved: "system", systemDark: false, theme: undefined, chrome: "#f2f2f6" },
  { saved: "light", systemDark: true, theme: undefined, chrome: "#f2f2f6" },
  { saved: "dark", systemDark: false, theme: "dark", chrome: "#000000" },
])(
  "restores $saved with system dark=$systemDark before paint",
  ({ saved, systemDark, theme, chrome }) => {
    const dataset: Record<string, string> = {};
    const meta = { content: "#f2f2f6" };
    runInNewContext(script, {
      localStorage: { getItem: () => saved },
      matchMedia: () => ({ matches: systemDark }),
      document: {
        documentElement: { dataset },
        querySelector: () => meta,
      },
    });
    expect(dataset.theme).toBe(theme);
    expect(meta.content).toBe(chrome);
  },
);

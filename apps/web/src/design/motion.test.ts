import { duration, easing, pressScale } from "@stacks/client-runtime/motion";
import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

const declared = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Mobile animates with @stacks/client-runtime/motion directly; web mirrors it in CSS.
it.each(Object.entries(easing))("ease-%s matches the shared easing", (name, points) => {
  expect(declared(`ease-${name}`)).toBe(`cubic-bezier(${points.join(", ")})`);
});

it.each(Object.entries(duration))("%s matches the shared duration", (name, ms) => {
  expect(declared(`duration-${kebab(name)}`)).toBe(`${ms}ms`);
});

it("presses to the shared scale", () => {
  expect(declared("press-scale")).toBe(`${pressScale}`);
});

it("exits faster than it enters", () => {
  expect(duration.menuOut).toBeLessThan(duration.menuIn);
  expect(duration.sheetOut).toBeLessThan(duration.sheetIn);
  expect(duration.toastOut).toBeLessThan(duration.toastIn);
});

it("turns every transition and animation off under reduced motion", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  *,"));
  expect(reduced).toMatch(/transition-duration:\s*0s !important/);
  expect(reduced).toMatch(/animation-duration:\s*1ms !important/);
  expect(reduced).toMatch(/animation-iteration-count:\s*1 !important/);
});

import { expect, it } from "vite-plus/test";

import { pinnedFooterChrome } from "./pinnedFooterChrome";

it("draws Android's edge and surface only when the footer has content", () => {
  expect(pinnedFooterChrome({ filled: true, felt: false, surface: true })).toContain("border-t");
  expect(pinnedFooterChrome({ filled: false, felt: false, surface: true })).toBe("");
});

it("keeps the felt's colour for a filled footer and drops it for an empty one", () => {
  expect(pinnedFooterChrome({ filled: true, felt: true, surface: true })).toContain("bg-felt");
  expect(pinnedFooterChrome({ filled: false, felt: true, surface: true })).toBe("");
});

it("draws a solid canvas band on the active path even when callers ask for clear chrome", () => {
  expect(pinnedFooterChrome({ filled: true, felt: false, surface: false })).toBe(
    "pt-3 border-t border-line bg-canvas",
  );
});

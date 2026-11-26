import { expect, it } from "vite-plus/test";

import { afterClosing, type OpenSheet } from "./visitSheets";

it("returns to Edit from each of its fields and its history", () => {
  for (const type of ["buy_in", "start_time", "game", "venue", "trip", "history"] as const)
    expect(afterClosing({ type })).toEqual({ type: "edit" });
  expect(afterClosing({ type: "seat", from: "edit" })).toEqual({ type: "edit" });
});

it("closes everything else, Edit and live seat picker included", () => {
  for (const type of ["edit", "seat", "rebuy", "cash_out", "reopen", "return"] as const)
    expect(afterClosing({ type } satisfies OpenSheet)).toBeNull();
  expect(afterClosing(null)).toBeNull();
});

import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { EntryId } from "@stacks/contracts";

import { newId } from "./ids.ts";

it("mints IDs the API accepts", () => {
  const id = newId();
  expect(Schema.is(EntryId)(id)).toBe(true);
  expect(id[14]).toBe("7");
  expect("89ab").toContain(id[19]);
});

it("sorts IDs by when they were made", () => {
  const ids = [newId(1_700_000_000_000), newId(1_700_000_000_001), newId(1_800_000_000_000)];
  expect(ids.toSorted()).toEqual(ids);
});

it("keeps IDs minted in the same millisecond in minting order", () => {
  const ids = Array.from({ length: 2000 }, () => newId(1_700_000_000_000));
  expect(ids.toSorted()).toEqual(ids);
  expect(new Set(ids).size).toBe(ids.length);
});

it("keeps IDs ordered when the clock steps back", () => {
  const first = newId(1_700_000_005_000);
  const second = newId(1_700_000_004_000);
  expect(first < second).toBe(true);
});

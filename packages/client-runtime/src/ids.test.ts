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

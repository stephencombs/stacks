import { describe, expect, it } from "@effect/vitest";

import { GroupId, TableId } from "./ids.ts";
import { groupScope, tableScope } from "./realtime.ts";

const id = "0192e7a0-0000-7000-8000-0000000000c1";

describe("groupScope", () => {
  it("names one channel for a group whatever the id's case", () => {
    expect(groupScope(GroupId.make(id.toUpperCase()))).toBe(groupScope(GroupId.make(id)));
    expect(groupScope(GroupId.make(id.toUpperCase()))).toBe(`group:${id}`);
  });
});

describe("tableScope", () => {
  it("names one channel for a table whatever the id's case", () => {
    expect(tableScope(TableId.make(id.toUpperCase()))).toBe(tableScope(TableId.make(id)));
    expect(tableScope(TableId.make(id.toUpperCase()))).toBe(`table:${id}`);
  });
});

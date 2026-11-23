import { describe, expect, it } from "@effect/vitest";

import { GroupId } from "./ids.ts";
import { groupScope } from "./realtime.ts";

describe("groupScope", () => {
  it("names one channel for a group whatever the id's case", () => {
    const id = "0192e7a0-0000-7000-8000-0000000000c1";

    expect(groupScope(GroupId.make(id.toUpperCase()))).toBe(groupScope(GroupId.make(id)));
    expect(groupScope(GroupId.make(id.toUpperCase()))).toBe(`group:${id}`);
  });
});

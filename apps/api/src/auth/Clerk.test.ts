import { describe, expect, it } from "@effect/vitest";

import { isNativeSession } from "./Clerk.ts";

describe("isNativeSession", () => {
  it("accepts a native token without a browser origin", () => {
    expect(isNativeSession(undefined)).toBe(true);
  });

  it("refuses a browser token", () => {
    expect(isNativeSession("https://anywhere.example.com")).toBe(false);
  });
});

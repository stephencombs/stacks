import { describe, expect, it } from "@effect/vitest";

import { fromAuthorizedParty } from "./Clerk.ts";

describe("fromAuthorizedParty", () => {
  const web = ["https://stacks.example.com"];

  it("takes a browser token from the web app", () => {
    expect(fromAuthorizedParty("https://stacks.example.com", web)).toBe(true);
  });

  it("refuses a browser token minted for another site", () => {
    expect(fromAuthorizedParty("https://evil.example.com", web)).toBe(false);
  });

  it("takes a token from the native app, which has no origin to name", () => {
    expect(fromAuthorizedParty(undefined, web)).toBe(true);
  });

  it("takes anything when no parties are configured", () => {
    expect(fromAuthorizedParty("https://anywhere.example.com", [])).toBe(true);
  });
});

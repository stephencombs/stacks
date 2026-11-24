import { expect, it } from "vite-plus/test";

import { linkAddress } from "./linkAddress";

it.each(["t", "invite", "join", "claim"])("reads %s's token from the fragment", (kind) => {
  expect(linkAddress(`/${kind}#abc_DEF-123`)).toBe(`${kind}/abc_DEF-123`);
  expect(linkAddress(`${kind}#abc`)).toBe(`${kind}/abc`);
});

it("leaves scheme paths and other addresses alone", () => {
  expect(linkAddress("t/abc")).toBe("t/abc");
  expect(linkAddress("/invite/abc")).toBe("/invite/abc");
  expect(linkAddress("stats?groupId=g1")).toBe("stats?groupId=g1");
  expect(linkAddress("/t#")).toBe("/t#");
  expect(linkAddress("/other#abc")).toBe("/other#abc");
  expect(linkAddress("/t/abc#frag")).toBe("/t/abc#frag");
});

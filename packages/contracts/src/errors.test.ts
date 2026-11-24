import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { Unauthorized } from "./errors.ts";

it("decodes a 401 from a build that doesn't send a reason", () => {
  const old = Schema.decodeUnknownSync(Unauthorized)(JSON.parse('{"_tag":"Unauthorized"}'));

  expect(old.reason).toBeUndefined();
});

it("carries why an account is refused", () => {
  const refused = Schema.decodeUnknownSync(Unauthorized)(
    JSON.parse('{"_tag":"Unauthorized","reason":"account_deleted"}'),
  );

  expect(refused.reason).toBe("account_deleted");
  expect(new Unauthorized({ reason: "account_deleted" }).reason).toBe("account_deleted");
});

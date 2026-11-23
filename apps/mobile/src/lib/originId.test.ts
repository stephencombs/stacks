import { OriginId } from "@stacks/contracts";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";

import { resolveOrigin, type OriginStorage } from "./originId";

const valid = Schema.is(OriginId);

const memory = (saved: string | null) => {
  const kept = { saved };

  const storage: OriginStorage = {
    read: () => kept.saved,
    write: (value) => void (kept.saved = value),
  };

  return { kept, storage };
};

it("keeps a saved id that the API will accept", () => {
  const { kept, storage } = memory("0192e7a0-0000-7000-8000-0000000000a1");

  expect(resolveOrigin(storage)).toBe("0192e7a0-0000-7000-8000-0000000000a1");
  expect(kept.saved).toBe("0192e7a0-0000-7000-8000-0000000000a1");
});

it("makes and saves a new id when nothing is saved, or what's saved the API would drop", () => {
  for (const saved of [null, "", "has a space", "x".repeat(65), "ünï"]) {
    const { kept, storage } = memory(saved);
    const origin = resolveOrigin(storage);

    expect(valid(origin)).toBe(true);
    expect(kept.saved).toBe(origin);
  }
});

it("falls back to an id for this launch when the filesystem fails", () => {
  const failing: OriginStorage = {
    read: () => {
      throw new Error("disk unavailable");
    },
    write: () => {
      throw new Error("disk full");
    },
  };

  expect(valid(resolveOrigin(failing))).toBe(true);

  const readOnly: OriginStorage = { read: () => null, write: failing.write };

  expect(valid(resolveOrigin(readOnly))).toBe(true);
});

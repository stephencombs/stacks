import { newId } from "@stacks/client-runtime/ids";
import { OriginId } from "@stacks/contracts";
import * as Schema from "effect/Schema";

export interface OriginStorage {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
}

const valid = Schema.is(OriginId);

/**
 * The saved install id if the API would accept it, else a new one, saved when it can be. A
 * filesystem that fails costs a fresh id for this launch, never the launch.
 */
export const resolveOrigin = (storage: OriginStorage) => {
  try {
    const saved = storage.read()?.trim() ?? "";

    if (valid(saved)) return saved;
  } catch {}

  const created = newId();

  try {
    storage.write(created);
  } catch {}

  return created;
};

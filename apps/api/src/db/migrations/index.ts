import * as Migrator from "effect/sql/Migrator";

import init from "./0001_init.ts";

export const migrations = Migrator.fromRecord({
  "0001_init": init,
});

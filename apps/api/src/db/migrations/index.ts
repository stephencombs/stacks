import * as Migrator from "effect/sql/Migrator";

import init from "./0001_init.ts";
import zeroCashOut from "./0002_zero_cash_out.ts";

export const migrations = Migrator.fromRecord({
  "0001_init": init,
  "0002_zero_cash_out": zeroCashOut,
});

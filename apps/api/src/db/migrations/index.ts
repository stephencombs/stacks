import * as Migrator from "effect/sql/Migrator";

import init from "./0001_init.ts";
import zeroCashOut from "./0002_zero_cash_out.ts";
import stakes from "./0003_stakes.ts";

export const migrations = Migrator.fromRecord({
  "0001_init": init,
  "0002_zero_cash_out": zeroCashOut,
  "0003_stakes": stakes,
});

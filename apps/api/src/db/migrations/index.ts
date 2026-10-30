import * as Migrator from "effect/sql/Migrator";

import init from "./0001_init.ts";
import zeroCashOut from "./0002_zero_cash_out.ts";
import stakes from "./0003_stakes.ts";
import trips from "./0004_trips.ts";
import tripOwnsPlay from "./0005_trip_owns_play.ts";
import seatings from "./0006_seatings.ts";
import tableSeats from "./0007_table_seats.ts";
import fiveSeatDefault from "./0008_five_seat_default.ts";

export const migrations = Migrator.fromRecord({
  "0001_init": init,
  "0002_zero_cash_out": zeroCashOut,
  "0003_stakes": stakes,
  "0004_trips": trips,
  "0005_trip_owns_play": tripOwnsPlay,
  "0006_seatings": seatings,
  "0007_table_seats": tableSeats,
  "0008_five_seat_default": fiveSeatDefault,
});

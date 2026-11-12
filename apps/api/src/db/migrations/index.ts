import * as Migrator from "effect/sql/Migrator";

import init from "./0001_init.ts";
import zeroCashOut from "./0002_zero_cash_out.ts";
import stakes from "./0003_stakes.ts";
import trips from "./0004_trips.ts";
import tripOwnsPlay from "./0005_trip_owns_play.ts";
import seatings from "./0006_seatings.ts";
import tableSeats from "./0007_table_seats.ts";
import fiveSeatDefault from "./0008_five_seat_default.ts";
import highLimit from "./0009_high_limit.ts";
import paymentHandles from "./0010_payment_handles.ts";
import userLimits from "./0011_user_limits.ts";
import personalRecording from "./0012_personal_recording.ts";
import legacyImport from "./0013_legacy_import.ts";
import sharedTables from "./0014_shared_tables.ts";
import tableParticipants from "./0015_table_participants.ts";
import invitesRecorders from "./0016_invites_recorders.ts";
import playerMoney from "./0017_player_money.ts";
import claimedTablePlayers from "./0018_claimed_table_players.ts";
import removeSettlementsPaymentsLimits from "./0019_remove_settlements_payments_limits.ts";

export const records = {
  "0001_init": init,
  "0002_zero_cash_out": zeroCashOut,
  "0003_stakes": stakes,
  "0004_trips": trips,
  "0005_trip_owns_play": tripOwnsPlay,
  "0006_seatings": seatings,
  "0007_table_seats": tableSeats,
  "0008_five_seat_default": fiveSeatDefault,
  "0009_high_limit": highLimit,
  "0010_payment_handles": paymentHandles,
  "0011_user_limits": userLimits,
  "0012_personal_recording": personalRecording,
  "0013_legacy_import": legacyImport,
  "0014_shared_tables": sharedTables,
  "0015_table_participants": tableParticipants,
  "0016_invites_recorders": invitesRecorders,
  "0017_player_money": playerMoney,
  "0018_claimed_table_players": claimedTablePlayers,
  "0019_remove_settlements_payments_limits": removeSettlementsPaymentsLimits,
};

export const migrations = Migrator.fromRecord(records);

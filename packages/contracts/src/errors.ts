import * as Schema from "effect/Schema";

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {
    reason: Schema.Literals([
      "not_a_member",
      "admins_only",
      "owner_only",
      "not_your_entry",
      "not_your_stake",
    ]),
  },
  { httpApiStatus: 403 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {
    resource: Schema.Literals([
      "group",
      "player",
      "invite",
      "claim",
      "venue",
      "session",
      "entry",
      "stake",
    ]),
  },
  { httpApiStatus: 404 },
) {}

/** The request is well formed but the ledger's current state doesn't allow it. */
export const ConflictReason = Schema.Literals([
  "id_taken",
  "invite_expired",
  "invite_revoked",
  "invite_used_up",
  "claim_has_history",
  "player_not_in_group",
  "player_not_in_session",
  "venue_not_available",
  "session_closed",
  "session_open",
  "players_not_cashed_out",
  "entry_voided",
  "balance_not_settled",
  "stake_voided",
  "stake_ended",
  "stake_open",
  "last_owner",
]);
export type ConflictReason = typeof ConflictReason.Type;

export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { reason: ConflictReason },
  { httpApiStatus: 409 },
) {}

/** The request breaks a ledger rule the schema alone can't express. */
export class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

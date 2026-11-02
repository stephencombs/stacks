import * as Schema from "effect/Schema";
import {
  Conflict,
  Forbidden,
  InvalidRequest,
  NotFound,
  Unauthorized,
  type ConflictReason,
} from "@stacks/contracts";

const conflictMessages: Record<ConflictReason, string> = {
  id_taken: "That was already saved. Refresh and try again.",
  invite_expired: "This invite has expired. Ask for a new one.",
  invite_revoked: "This invite was cancelled. Ask for a new one.",
  invite_used_up: "This invite has been used up. Ask for a new one.",
  claim_has_history:
    "You already have history in this group, so this guest can't be merged into you.",
  player_not_in_group: "That player isn't in this group.",
  player_not_in_session: "That player isn't in this session.",
  seat_taken: "Someone's already in that seat.",
  venue_not_available: "That venue isn't available to this group.",
  session_closed: "This session is closed. An admin can reopen it.",
  session_open: "This session is still live.",
  players_not_cashed_out: "Everyone who bought in needs a cash-out first. Record $0 for a bust.",
  entry_voided: "That entry was already voided.",
  balance_not_settled: "Settle up first: you can't leave while you owe or are owed.",
  last_owner: "Make someone else the owner or remove everyone else first.",
  stake_voided: "That stake was voided.",
  stake_ended: "That stake has already ended. Reopen it first.",
  stake_open: "That stake is still open.",
  trip_not_empty: "Only a trip with nothing played in it can be deleted. End it instead.",
  trip_ended: "That trip has ended. Reopen it to start a session in it.",
  trip_open: "That trip is still going.",
};

const forbiddenMessages: Record<Forbidden["reason"], string> = {
  not_a_member: "You're not in this group.",
  admins_only: "Only the group's admins can do that.",
  owner_only: "Only the group's owner can do that.",
  not_your_entry: "Only whoever added it, the player or an admin can void that entry.",
  not_your_stake:
    "Only the backer, the player, whoever added it or an admin can change that stake.",
  not_your_trip: "Only whoever started the trip or an admin can delete it.",
};

const isConflict = Schema.is(Conflict);
const isForbidden = Schema.is(Forbidden);
const isNotFound = Schema.is(NotFound);
const isInvalid = Schema.is(InvalidRequest);
const isUnauthorized = Schema.is(Unauthorized);

/** A sentence to show a person for any failure the API or network can produce. */
export const describeError = (error: unknown): string => {
  if (isConflict(error)) return conflictMessages[error.reason];
  if (isForbidden(error)) return forbiddenMessages[error.reason];
  if (isNotFound(error)) return "That doesn't exist anymore.";
  if (isInvalid(error)) return error.message;
  if (isUnauthorized(error)) return "Your sign-in expired. Sign in again.";
  return "Couldn't reach Stacks. Check your connection and try again.";
};

/**
 * Whether trying again later could work. The API's own refusals won't change on a retry; anything
 * else (no signal, a timeout, an expired sign-in) might.
 */
export const isRetryable = (error: unknown) =>
  !(isConflict(error) || isForbidden(error) || isNotFound(error) || isInvalid(error));

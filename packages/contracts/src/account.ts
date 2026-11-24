import * as Schema from "effect/Schema";

import { GroupId, PlayerId } from "./ids.ts";
import { CurrencyCode, MinorUnits } from "./money.ts";

const DeletedGroup = Schema.Struct({ id: GroupId, name: Schema.String });

/** What deleting the account does to the groups it is in, so the person can see it first. */
export const AccountDeletionPreview = Schema.Struct({
  /** Groups with no other active member: deleted along with everything in them. */
  soloGroups: Schema.Array(DeletedGroup),
  /** Groups whose ownership passes to someone else. */
  ownershipMoves: Schema.Array(
    Schema.Struct({
      group: DeletedGroup,
      newOwner: Schema.Struct({ playerId: PlayerId, displayName: Schema.String }),
    }),
  ),
  /** What the person is owed (positive) or owes (negative) in groups that stay. It carries over. */
  openBalances: Schema.Array(
    Schema.Struct({
      group: DeletedGroup,
      currency: CurrencyCode,
      amount: MinorUnits,
    }),
  ),
  /** Open stakes in groups that stay, counting the person as backer or player. They carry over. */
  openStakes: Schema.Array(Schema.Struct({ group: DeletedGroup, count: Schema.Int })),
  /** Whether the Clerk user has Apple linked, so the app knows to ask for an authorization code. */
  appleLinked: Schema.Boolean,
});

export type AccountDeletionPreview = typeof AccountDeletionPreview.Type;

export const DeleteAccountRequest = Schema.Struct({
  /** From the Apple sheet on iOS. The server revokes it after deleting, and never waits on it. */
  authorizationCode: Schema.optionalKey(Schema.NonEmptyString),
});

/**
 * `pending` means the sign-in record at Clerk isn't deleted yet and a retry will finish it. The
 * account itself is already gone either way.
 */
export const AccountDeletionResult = Schema.Struct({
  status: Schema.Literals(["pending", "complete"]),
});

export type AccountDeletionResult = typeof AccountDeletionResult.Type;

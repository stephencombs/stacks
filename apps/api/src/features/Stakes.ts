import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Forbidden,
  InvalidRequest,
  NotFound,
  type CreateStakeRequest,
  type EndStakeRequest,
  type StakeId,
  type TripId,
  type VoidEntryRequest,
} from "@stacks/contracts";

import { StakeRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Trips from "./Trips.ts";

const load = Effect.fn("Stakes.load")(function* (stakeId: StakeId) {
  const sql = yield* SqlClient.SqlClient;
  const [stake] = yield* sql`select * from stakes where id = ${stakeId}`.pipe(
    Effect.flatMap(Access.decodeRows(StakeRow)),
  );
  if (!stake) return yield* new NotFound({ resource: "stake" });
  return stake;
});

/** The lender, the borrower, whoever added the stake or an admin can change it. */
const loadToChange = Effect.fn("Stakes.loadToChange")(function* (stakeId: StakeId) {
  const stake = yield* load(stakeId);
  const member = yield* Access.membership(stake.groupId);
  const { userId } = yield* CurrentUser;
  if (
    member.role === "member" &&
    stake.createdBy !== userId &&
    member.playerId !== stake.lenderId &&
    member.playerId !== stake.borrowerId
  ) {
    return yield* new Forbidden({ reason: "not_your_stake" });
  }
  if (stake.voidedAt !== null) return yield* new Conflict({ reason: "stake_voided" });
  return stake;
});

export const create = Effect.fn("Stakes.create")(function* (
  tripId: TripId,
  request: typeof CreateStakeRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const { groupId } = yield* Trips.load(tripId);
  yield* Access.membership(groupId);
  if (request.lenderId === request.borrowerId) {
    return yield* new InvalidRequest({ message: "Pick two different players." });
  }
  yield* Access.requirePlayersInGroup(groupId, [request.lenderId, request.borrowerId]);
  const startedAt = request.startedAt ?? (yield* DateTime.now);
  yield* sql`
    insert into stakes (id, group_id, trip_id, lender_id, borrower_id, amount, lender_share,
      started_at, note, created_by)
    values (${request.id}, ${groupId}, ${tripId}, ${request.lenderId}, ${request.borrowerId},
      ${BigInt(request.amount)}, ${request.lenderShare}, ${DateTime.toDateUtc(startedAt)},
      ${request.note}, ${userId})
    on conflict (id) do nothing
  `;
  const stored = yield* load(request.id);
  if (stored.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  return stored;
});

export const end = Effect.fn("Stakes.end")(function* (
  stakeId: StakeId,
  request: typeof EndStakeRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const stake = yield* loadToChange(stakeId);
  if (stake.endedAt !== null) return yield* new Conflict({ reason: "stake_ended" });
  const endedAt = request.endedAt ?? (yield* DateTime.now);
  if (DateTime.isLessThan(endedAt, stake.startedAt)) {
    return yield* new InvalidRequest({ message: "A stake can't end before it started." });
  }
  yield* sql`update stakes set ended_at = ${DateTime.toDateUtc(endedAt)} where id = ${stakeId}`;
  return yield* load(stakeId);
});

export const reopen = Effect.fn("Stakes.reopen")(function* (stakeId: StakeId) {
  const sql = yield* SqlClient.SqlClient;
  const stake = yield* loadToChange(stakeId);
  if (stake.endedAt === null) return yield* new Conflict({ reason: "stake_open" });
  yield* sql`update stakes set ended_at = null where id = ${stakeId}`;
  return yield* load(stakeId);
});

export const voidStake = Effect.fn("Stakes.void")(function* (
  stakeId: StakeId,
  request: typeof VoidEntryRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* loadToChange(stakeId);
  yield* sql`
    update stakes set voided_at = now(), voided_by = ${userId}, void_reason = ${request.reason}
    where id = ${stakeId} and voided_at is null
  `;
  return yield* load(stakeId);
});

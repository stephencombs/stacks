import { MinorUnits, type PlayEntry, type PlayerId, type Visit } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { playerResults, type PlayerResult } from "./results.ts";

export type TableVisit = Pick<Visit, "id" | "playerId" | "startedAt" | "finishedAt"> & {
  readonly deletedAt?: DateTime.Utc | undefined;
};
export type TableEntry = Pick<PlayEntry, "visitId" | "kind" | "amount" | "voidedAt">;

export interface GroupTable {
  readonly startedAt: DateTime.Utc;
  /** When the last player cashed out; null while anyone is still playing. */
  readonly endedAt: DateTime.Utc | null;
  /** Each group member at the table, in the order they first sat down. */
  readonly members: ReadonlyArray<PlayerResult & { readonly playerId: PlayerId }>;
  /** Members still playing. */
  readonly playing: ReadonlyArray<PlayerId>;
  /** Table players whose play counts for no member: on the table, not in standings. */
  readonly others: ReadonlyArray<
    PlayerResult & { readonly playerId: PlayerId; readonly playing: boolean }
  >;
}

const none = MinorUnits.make(0);
const ZERO: PlayerResult = { buyIn: none, cashOut: none, adjustment: none, net: none };

/**
 * A table as its trip's group sees it. `memberOf` names the group member a visit counts for, or
 * null when it counts for no one. It takes the visit, not the player, because a link can hold for
 * some of a player's visits and not others. Deleted visits don't count; null if nothing's left.
 */
export const groupTable = (
  visits: Iterable<TableVisit>,
  entries: Iterable<TableEntry>,
  memberOf: (visit: TableVisit) => PlayerId | null,
): GroupTable | null => {
  const shown = Array.from(visits)
    .filter((visit) => visit.deletedAt === undefined)
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(a.startedAt) - DateTime.toEpochMillis(b.startedAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  if (shown.length === 0) return null;

  const owners = new Map(
    shown.map((visit) => {
      const member = memberOf(visit);
      return [visit.id, member === null ? { other: visit.playerId } : { member }] as const;
    }),
  );
  const ledger = (pick: "member" | "other") =>
    playerResults(
      Array.from(entries).flatMap((entry) => {
        const owner = owners.get(entry.visitId);
        const playerId = owner && (pick === "member" ? owner.member : owner.other);
        return playerId ? [{ ...entry, playerId }] : [];
      }),
    );
  const memberResults = ledger("member");
  const otherResults = ledger("other");
  const open = shown.filter((visit) => visit.finishedAt === null);

  const members = new Map<PlayerId, boolean>();
  const others = new Map<PlayerId, boolean>();
  for (const visit of shown) {
    const owner = owners.get(visit.id)!;
    const [into, id] = owner.member ? [members, owner.member] : [others, owner.other!];
    into.set(id, (into.get(id) ?? false) || visit.finishedAt === null);
  }

  return {
    startedAt: shown[0]!.startedAt,
    endedAt:
      open.length > 0
        ? null
        : shown
            .map((visit) => visit.finishedAt!)
            .reduce((latest, at) => (DateTime.isGreaterThan(at, latest) ? at : latest)),
    members: Array.from(members.keys(), (playerId) => ({
      playerId,
      ...(memberResults.get(playerId) ?? ZERO),
    })),
    playing: Array.from(members).flatMap(([playerId, playing]) => (playing ? [playerId] : [])),
    others: Array.from(others, ([playerId, playing]) => ({
      playerId,
      playing,
      ...(otherResults.get(playerId) ?? ZERO),
    })),
  };
};

import type { PlayerId, PlayerIdentity, TableId } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";

import type { RecordingState } from "./recordingState.ts";

/**
 * Who can be named as Paid by or Paid to on `playerId`'s entry at a table: everyone else at it,
 * from this device and, when it's been fetched, the server's view of the whole table.
 */
export const counterpartiesAt = (
  state: RecordingState | null,
  tableId: TableId,
  playerId: PlayerId,
  view: TableView | null = null,
): ReadonlyArray<PlayerIdentity> => {
  const known = new Map<PlayerId, PlayerIdentity>();
  for (const player of [...(state?.players ?? []), ...(view?.players ?? [])])
    known.set(player.id, player);
  const ids = new Set<PlayerId>([
    ...(state?.tables.filter((table) => table.id === tableId).map((t) => t.starterPlayerId) ?? []),
    ...(state?.visits.filter((visit) => visit.tableId === tableId).map((v) => v.playerId) ?? []),
    ...(state?.participants.filter((item) => item.tableId === tableId).map((p) => p.playerId) ??
      []),
    ...(view?.table.id === tableId ? view.players.map((player) => player.id) : []),
  ]);
  ids.delete(playerId);
  return [...ids]
    .flatMap((id) => {
      const player = known.get(id);
      if (!player) return [];
      return [id === state?.self.id ? { ...player, displayName: "You" } : player];
    })
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
};

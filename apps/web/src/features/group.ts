import type { GroupDetail, PlayerId } from "@stacks/contracts";

export const playerNames = (detail: GroupDetail) =>
  new Map<PlayerId, string>(detail.players.map((player) => [player.id, player.displayName]));

export const isAdmin = (detail: GroupDetail) => detail.role !== "member";

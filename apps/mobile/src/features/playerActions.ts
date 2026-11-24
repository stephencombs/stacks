import type { MemberRole, Player } from "@stacks/contracts";

/**
 * What the Player sheet offers for someone else in a group. Anyone in the group can link a photo
 * to a player on their own phone. Only a guest has a claim link, and only owners and admins act on
 * accounts: an admin on members, the owner on admins and members, nobody on an owner.
 */
export const playerActions = (
  viewer: { readonly role: MemberRole; readonly userId: string | null | undefined },
  player: Player,
) => {
  const manage =
    player.userId !== null &&
    player.userId !== viewer.userId &&
    player.role !== "owner" &&
    (viewer.role === "owner" || (viewer.role === "admin" && player.role === "member"));

  return {
    manage,
    claimLink: player.claimCode !== null,
    changeRole: manage && viewer.role === "owner",
  };
};

import type { MemberRole, Player } from "@stacks/contracts";

/**
 * What the Player sheet offers for someone else in a group. Anyone in the group can link a photo
 * to a player on their own phone. Only a guest has a claim link, and only owners and admins remove
 * people: an admin removes members and guests, the owner admins too, and nobody removes an owner.
 * A guest removed with history has no account and no claim link, and can be added back.
 */
export const playerActions = (
  viewer: { readonly role: MemberRole; readonly userId: string | null | undefined },
  player: Player,
) => {
  const admin = viewer.role !== "member";

  const manage =
    player.userId !== null &&
    player.userId !== viewer.userId &&
    player.role !== "owner" &&
    (viewer.role === "owner" || (viewer.role === "admin" && player.role === "member"));

  return {
    manage,
    claimLink: player.claimCode !== null,
    changeRole: manage && viewer.role === "owner",
    removeGuest: admin && player.userId === null && player.claimCode !== null,
    addBack: admin && player.userId === null && player.claimCode === null,
  };
};

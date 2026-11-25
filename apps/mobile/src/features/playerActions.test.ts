import { PlayerId, UserId, type MemberRole, type Player } from "@stacks/contracts";
import { expect, it } from "vite-plus/test";

import { playerActions } from "./playerActions";

const viewerId = UserId.make("user_viewer");

const member = (role: MemberRole, userId = UserId.make("user_other")) =>
  ({
    id: PlayerId.make("0192e7a0-0000-7000-8000-000000000001"),
    displayName: "Ada",
    userId,
    role,
    claimCode: null,
  }) satisfies Player;

const guest: Player = {
  id: PlayerId.make("0192e7a0-0000-7000-8000-000000000002"),
  displayName: "Grace",
  userId: null,
  role: null,
  claimCode: "claim-code",
};

const as = (role: MemberRole) => ({ role, userId: viewerId });

it("lets an owner change roles and remove admins and members, but never another owner", () => {
  expect(playerActions(as("owner"), member("admin"))).toEqual({
    manage: true,
    claimLink: false,
    changeRole: true,
    removeGuest: false,
    addBack: false,
  });
  expect(playerActions(as("owner"), member("member")).changeRole).toBe(true);
  expect(playerActions(as("owner"), member("owner")).manage).toBe(false);
});

it("lets an admin remove members only, and never change a role", () => {
  expect(playerActions(as("admin"), member("member"))).toEqual({
    manage: true,
    claimLink: false,
    changeRole: false,
    removeGuest: false,
    addBack: false,
  });
  expect(playerActions(as("admin"), member("admin")).manage).toBe(false);
  expect(playerActions(as("admin"), member("owner")).manage).toBe(false);
});

it("gives a plain member nothing to manage, for every role", () => {
  for (const role of ["owner", "admin", "member"] as const)
    expect(playerActions(as("member"), member(role))).toEqual({
      manage: false,
      claimLink: false,
      changeRole: false,
      removeGuest: false,
      addBack: false,
    });
});

it("never manages yourself, and never manages a guest as an account", () => {
  expect(playerActions(as("owner"), member("member", viewerId)).manage).toBe(false);

  for (const role of ["owner", "admin", "member"] as const)
    expect(playerActions(as(role), guest)).toMatchObject({
      manage: false,
      claimLink: true,
      changeRole: false,
    });
});

it("lets owners and admins remove a guest, and add back one removed with history", () => {
  const removed: Player = { ...guest, claimCode: null };
  const former = { ...member("member"), role: null } satisfies Player;

  for (const role of ["owner", "admin"] as const) {
    expect(playerActions(as(role), guest)).toMatchObject({ removeGuest: true, addBack: false });
    expect(playerActions(as(role), removed)).toMatchObject({ removeGuest: false, addBack: true });
    expect(playerActions(as(role), former)).toMatchObject({ removeGuest: false, addBack: false });
  }

  expect(playerActions(as("member"), guest).removeGuest).toBe(false);
  expect(playerActions(as("member"), removed).addBack).toBe(false);
});

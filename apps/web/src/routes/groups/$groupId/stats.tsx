import { createFileRoute, redirect } from "@tanstack/react-router";
import { GroupId } from "@stacks/contracts";

/** The group's old stats page: Stats, with the group picked. */
export const Route = createFileRoute("/groups/$groupId/stats")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/stats",
      state: { statsPick: { groupId: GroupId.make(params.groupId) } },
      replace: true,
    });
  },
});

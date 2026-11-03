import { createFileRoute, redirect } from "@tanstack/react-router";

/** Before the group had a hub, its settings page was People. Old links still land there. */
export const Route = createFileRoute("/groups/$groupId/settings")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/groups/$groupId/people", params, replace: true });
  },
});

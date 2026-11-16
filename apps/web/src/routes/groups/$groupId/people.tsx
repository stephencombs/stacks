import { createFileRoute, redirect } from "@tanstack/react-router";

/** People live on the group's own page now. */
export const Route = createFileRoute("/groups/$groupId/people")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/groups/$groupId", params, replace: true });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

/** Your groups live in Crew now. */
export const Route = createFileRoute("/groups/")({
  beforeLoad: () => {
    throw redirect({ to: "/crew", replace: true });
  },
});

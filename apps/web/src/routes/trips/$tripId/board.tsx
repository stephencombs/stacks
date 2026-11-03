import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/board")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/trips/$tripId/results", params, replace: true });
  },
});

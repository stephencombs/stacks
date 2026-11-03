import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/results")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/trips/$tripId/board", params, replace: true });
  },
});

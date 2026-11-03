import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/trips/$tripId/money")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/trips/$tripId/settle", params, replace: true });
  },
});

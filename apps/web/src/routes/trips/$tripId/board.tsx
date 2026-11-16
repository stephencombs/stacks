import { createFileRoute, redirect } from "@tanstack/react-router";
import { TripId } from "@stacks/contracts";

/** The trip's old Board: Stats, with its group and the trip picked. */
export const Route = createFileRoute("/trips/$tripId/board")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/stats",
      state: { statsPick: { tripId: TripId.make(params.tripId) } },
      replace: true,
    });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { TripId } from "@stacks/contracts";

/** The trip's old Results: Stats, with its group and the trip picked. */
export const Route = createFileRoute("/trips/$tripId/results")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/stats",
      state: { statsPick: { tripId: TripId.make(params.tripId) } },
      replace: true,
    });
  },
});

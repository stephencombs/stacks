import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "~/components/ui/Page";

export const Route = createFileRoute("/stats")({ component: Stats });

function Stats() {
  return (
    <>
      <PageHeader title="Stats" />
      <EmptyState title="Your stats are on the way">
        Results, hours and win rate across your sessions, by time, game, venue and trip, will show
        here. Your sessions and their results are on Play.
      </EmptyState>
    </>
  );
}

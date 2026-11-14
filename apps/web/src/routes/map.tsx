import { createFileRoute } from "@tanstack/react-router";

import { EmptyState, PageHeader } from "~/components/ui/Page";

export const Route = createFileRoute("/map")({ component: Map });

function Map() {
  return (
    <>
      <PageHeader title="Map" />
      <EmptyState title="Your map is on the way">
        The venues you've played, colored by how you did there, will show here.
      </EmptyState>
    </>
  );
}

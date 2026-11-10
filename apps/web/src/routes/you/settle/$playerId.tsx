import { createFileRoute } from "@tanstack/react-router";
import { PlayerId } from "@stacks/contracts";
import * as Option from "effect/Option";

import { BackLink } from "~/components/ui/Nav";
import { EmptyState, PageHeader } from "~/components/ui/Page";
import { PersonalFrame } from "~/features/Personal";
import { SettleUpPerson } from "~/features/SettleUp";

export const Route = createFileRoute("/you/settle/$playerId")({ component: PersonPage });

function PersonPage() {
  const { playerId } = Route.useParams();
  const id = Option.getOrNull(PlayerId.makeOption(playerId));
  return (
    <PersonalFrame>
      {id ? (
        <SettleUpPerson key={id} playerId={id} />
      ) : (
        <>
          <PageHeader back={<BackLink to="/you/settle">Settle up</BackLink>} title="Settle up" />
          <EmptyState title="No one here">
            This isn't someone you've shared a table with.
          </EmptyState>
        </>
      )}
    </PersonalFrame>
  );
}

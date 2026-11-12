import { createFileRoute } from "@tanstack/react-router";
import { SessionId } from "@stacks/contracts";

import { SessionView } from "~/features/SessionView";
import { Loaded, Prefetch, Settled, useStacks } from "~/lib/stacks";
import { SessionPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/sessions/$sessionId")({ component: SessionPage });

function SessionPage() {
  const { sessionId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.session(SessionId.make(sessionId))} skeleton={<SessionPageSkeleton />}>
      {(session) => (
        // The page waits for the trip and group too rather than shifting, asking for everything at
        // once.
        <>
          <Prefetch query={stacks.trip(session.session.tripId)} />
          <Prefetch query={stacks.group(session.session.groupId)} />
          <Settled query={stacks.trip(session.session.tripId)} skeleton={<SessionPageSkeleton />}>
            <Loaded
              query={stacks.group(session.session.groupId)}
              skeleton={<SessionPageSkeleton />}
            >
              {(group) => <SessionView session={session} group={group} />}
            </Loaded>
          </Settled>
        </>
      )}
    </Loaded>
  );
}

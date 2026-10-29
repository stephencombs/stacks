import { createFileRoute } from "@tanstack/react-router";
import { SessionId } from "@stacks/contracts";

import { Skeleton } from "~/components/ui/Surface";
import { SessionView } from "~/features/SessionView";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/sessions/$sessionId")({ component: SessionPage });

function SessionPage() {
  const { sessionId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.session(SessionId.make(sessionId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(session) => (
        <Loaded
          query={stacks.group(session.session.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(group) => <SessionView session={session} group={group} />}
        </Loaded>
      )}
    </Loaded>
  );
}

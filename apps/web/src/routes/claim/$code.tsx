import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { PageHeader } from "~/components/ui/Page";
import { Loaded, useAction, useStacks } from "~/lib/stacks";
import { InviteSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/claim/$code")({ component: Claim });

function Claim() {
  const { code } = Route.useParams();
  const stacks = useStacks();
  const navigate = useNavigate();
  const claim = useAction(stacks.Client.mutation("guests", "claim"));
  const confirm = async () => {
    const claimed = await claim.run({ params: { code } });
    if (claimed) {
      const trip = claimed.trips.find((item) => item.endedAt === null);
      if (trip) void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });
      else void navigate({ to: "/groups/$groupId", params: { groupId: claimed.group.id } });
    }
  };
  return (
    <Loaded query={stacks.claimPreview(code)} skeleton={<InviteSkeleton />}>
      {(preview) =>
        preview.alreadyMember ? (
          <>
            <PageHeader title="You're already in this group" context={preview.groupName} />
            <div className="flex flex-col items-start gap-4">
              <p className="max-w-[52ch] text-muted">
                This link is for {preview.displayName}, who has been playing in {preview.groupName}{" "}
                as a guest. Opening it is how they join and keep their history. You already play
                here, so there's nothing for you to claim.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() =>
                  void navigate({ to: "/groups/$groupId", params: { groupId: preview.groupId } })
                }
              >
                Open group
              </Button>
            </div>
          </>
        ) : (
          <>
            <PageHeader title={`Are you ${preview.displayName}?`} context={preview.groupName} />
            <div className="flex flex-col items-start gap-4">
              <p className="max-w-[52ch] text-muted">
                {preview.displayName} has been playing in {preview.groupName} as a guest. Claim it
                to join the group and make their sessions, results and balance yours.
              </p>
              {claim.error ? <FormError>{claim.error}</FormError> : null}
              <Button
                variant="primary"
                size="lg"
                onClick={() => void confirm()}
                pending={claim.pending}
              >
                {`Yes, I'm ${preview.displayName}`}
              </Button>
            </div>
          </>
        )
      }
    </Loaded>
  );
}

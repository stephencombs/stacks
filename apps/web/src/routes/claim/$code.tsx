import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { PageTitle, Skeleton, Surface } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/claim/$code")({ component: Claim });

function Claim() {
  const { code } = Route.useParams();
  const stacks = useStacks();
  const navigate = useNavigate();
  const claim = useAction(stacks.Client.mutation("guests", "claim"));
  const confirm = async () => {
    const claimed = await claim.run({ params: { code } });
    if (claimed) void navigate({ to: "/groups/$groupId", params: { groupId: claimed.group.id } });
  };
  return (
    <div className="pt-4">
      <Loaded query={stacks.claimPreview(code)} skeleton={<Skeleton className="h-64" />}>
        {(preview) => (
          <Surface className="flex flex-col gap-5 p-6">
            <PageTitle context={preview.groupName}>Are you {preview.displayName}?</PageTitle>
            <p className="max-w-[52ch] text-muted">
              {preview.displayName} has been playing in {preview.groupName} as a guest. Claim it to
              join the group and make their sessions, results and balance yours.
            </p>
            {claim.error ? <FormError>{claim.error}</FormError> : null}
            <Button
              variant="primary"
              size="lg"
              onClick={() => void confirm()}
              disabled={claim.pending}
              className="self-start"
            >
              {claim.pending ? "Claiming…" : `Yes, I'm ${preview.displayName}`}
            </Button>
          </Surface>
        )}
      </Loaded>
    </div>
  );
}

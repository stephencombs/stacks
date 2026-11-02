import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { PageHeader } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
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
    <Loaded query={stacks.claimPreview(code)} skeleton={<Skeleton className="h-64" />}>
      {(preview) => (
        <>
          <PageHeader title={`Are you ${preview.displayName}?`} context={preview.groupName} />
          <div className="flex flex-col items-start gap-4">
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
            >
              {claim.pending ? "Claiming…" : `Yes, I'm ${preview.displayName}`}
            </Button>
          </div>
        </>
      )}
    </Loaded>
  );
}

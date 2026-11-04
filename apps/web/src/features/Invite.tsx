import { InviteId, type GroupDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";

import { CopyButton } from "~/components/CopyButton";
import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";
import { SkeletonText } from "./PageSkeletons";

/** The group's newest invite link to copy, or a button to make one. */
export function InlineInvite({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const origin = window.location.origin;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-sunken p-3">
      <Loaded
        query={stacks.invites(detail.group.id)}
        skeleton={
          <span aria-hidden className="flex h-9 items-center justify-between gap-2">
            <SkeletonText size="sm" className="w-48" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </span>
        }
      >
        {(invites) => {
          const active = invites[0];
          return active ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-muted">
                {`${origin}/join/${active.code}`}
              </span>
              <CopyButton text={`${origin}/join/${active.code}`} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                Send a link so friends can join {detail.group.name}.
              </span>
              <Button
                size="sm"
                pending={create.pending}
                onClick={() =>
                  void create.run({
                    params: { groupId: detail.group.id },
                    payload: { id: InviteId.make(newId()), maxUses: null },
                  })
                }
              >
                New invite link
              </Button>
            </div>
          );
        }}
      </Loaded>
      {create.error ? <FormError>{create.error}</FormError> : null}
    </div>
  );
}

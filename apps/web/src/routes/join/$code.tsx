import { useUser } from "@clerk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { InvitePreview } from "@stacks/contracts";
import { useState, type FormEvent } from "react";

import { Button, ButtonLink } from "~/components/ui/Button";
import { Field, FormError, Input } from "~/components/ui/Field";
import { PageHeader } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/join/$code")({ component: Join });

function Join() {
  const { code } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.invitePreview(code)} skeleton={<Skeleton className="h-64" />}>
      {(preview) => <JoinView code={code} preview={preview} />}
    </Loaded>
  );
}

const closedReasons = {
  expired: "This invite has expired.",
  revoked: "This invite was cancelled.",
  used_up: "This invite has been used up.",
} as const;

function JoinView({ code, preview }: { code: string; preview: InvitePreview }) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const { user } = useUser();
  const accept = useAction(stacks.Client.mutation("invites", "accept"));
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = String(new FormData(event.currentTarget).get("displayName")).trim();
    if (!displayName) return setNameError("Enter the name your friends know you by.");
    setNameError(null);
    const joined = await accept.run({ params: { code }, payload: { displayName } });
    if (joined) void navigate({ to: "/groups/$groupId", params: { groupId: joined.group.id } });
  };

  return (
    <>
      <PageHeader
        title={preview.groupName}
        context={`${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}`}
      />
      {preview.alreadyMember ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-muted">You're already in this group.</p>
          <ButtonLink to="/groups/$groupId" params={{ groupId: preview.groupId }} variant="primary">
            Open group
          </ButtonLink>
        </div>
      ) : preview.status !== "open" ? (
        <p className="text-muted">
          {closedReasons[preview.status]} Ask whoever sent it for a new link.
        </p>
      ) : (
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
          <Field label="Your name in this group" error={nameError}>
            {(props) => (
              <Input
                {...props}
                name="displayName"
                defaultValue={user?.firstName ?? ""}
                maxLength={60}
                autoComplete="given-name"
              />
            )}
          </Field>
          {accept.error ? <FormError>{accept.error}</FormError> : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            pending={accept.pending}
            className="self-start"
          >
            Join group
          </Button>
        </form>
      )}
    </>
  );
}

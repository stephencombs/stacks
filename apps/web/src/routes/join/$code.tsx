import { useUser } from "@clerk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { InvitePreview } from "@stacks/contracts";
import { useState, type FormEvent } from "react";

import { Button, ButtonLink } from "~/components/ui/Button";
import { Field, FormError, Input } from "~/components/ui/Field";
import { PageTitle, Skeleton, Surface } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/join/$code")({ component: Join });

function Join() {
  const { code } = Route.useParams();
  const stacks = useStacks();
  return (
    <div className="pt-4">
      <Loaded query={stacks.invitePreview(code)} skeleton={<Skeleton className="h-64" />}>
        {(preview) => <JoinView code={code} preview={preview} />}
      </Loaded>
    </div>
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
    <Surface className="flex flex-col gap-5 p-6">
      <PageTitle
        context={`${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}`}
      >
        {preview.groupName}
      </PageTitle>
      {preview.alreadyMember ? (
        <>
          <p className="text-muted">You're already in this group.</p>
          <ButtonLink
            to="/groups/$groupId"
            params={{ groupId: preview.groupId }}
            variant="primary"
            className="self-start"
          >
            Open group
          </ButtonLink>
        </>
      ) : preview.status !== "open" ? (
        <p className="text-muted">
          {closedReasons[preview.status]} Ask whoever sent it for a new link.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
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
            disabled={accept.pending}
            className="self-start"
          >
            {accept.pending ? "Joining…" : "Join group"}
          </Button>
        </form>
      )}
    </Surface>
  );
}

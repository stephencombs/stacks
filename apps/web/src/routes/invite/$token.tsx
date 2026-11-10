import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { fetchInvitePreview } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import { useRedeemInvite } from "@stacks/client-runtime/recordingReact";
import type { PlayerInvitePreview } from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { useEffect, useState } from "react";

import { Button, ButtonLink } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { EmptyState, Note, PageHeader } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
import { focusMain, PersonalFrame } from "~/features/Personal";

export const Route = createFileRoute("/invite/$token")({ component: InvitePage });

const api = { baseUrl: import.meta.env.VITE_API_URL ?? "" };

/** A personal invite: once taken up, this device records as the player it names. */
function InvitePage() {
  const { token } = Route.useParams();
  const [preview, setPreview] = useState<
    { ok: PlayerInvitePreview } | { error: string } | undefined
  >(undefined);
  const redeem = useRedeemInvite(token);
  const navigate = useNavigate();
  useEffect(() => {
    let current = true;
    void Effect.runPromiseExit(fetchInvitePreview(api, token)).then((exit) => {
      if (!current) return;
      if (Exit.isSuccess(exit)) return setPreview({ ok: exit.value });
      const failure = Exit.findErrorOption(exit);
      setPreview({
        error:
          failure._tag === "Some" && failure.value._tag === "Conflict"
            ? describeError(failure.value)
            : "This invite doesn't work. Ask whoever sent it for a new one.",
      });
    });
    return () => {
      current = false;
    };
  }, [token]);
  return (
    <PersonalFrame>
      <PageHeader title="Invite" />
      {preview === undefined ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : "error" in preview ? (
        <>
          <EmptyState title="This invite can't be used">{preview.error}</EmptyState>
          <ButtonLink to="/" className="self-start">
            Open Color Up
          </ButtonLink>
        </>
      ) : (
        <>
          <EmptyState title={`Record as ${preview.ok.player.displayName}`}>
            {preview.ok.startedBy
              ? `${preview.ok.startedBy} invited you to record your own play at their table.`
              : "You were invited to record your own play at a table."}{" "}
            Only take this up if you're {preview.ok.player.displayName}. It works once, and you
            don't need an account.
          </EmptyState>
          <Button
            variant="primary"
            className="self-start"
            pending={redeem.pending}
            onClick={async () => {
              if (await redeem.redeem()) void navigate({ to: "/" }).then(focusMain);
            }}
          >
            I'm {preview.ok.player.displayName}
          </Button>
          {redeem.error ? <FormError>{redeem.error}</FormError> : null}
          <Note>Your sessions at the table show in your play once this device syncs.</Note>
        </>
      )}
    </PersonalFrame>
  );
}

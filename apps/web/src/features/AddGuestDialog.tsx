import { PlayerId, type GroupDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input } from "~/components/ui/Field";
import { useAction, useStacks } from "~/lib/stacks";

export function AddGuestDialog({
  detail,
  open,
  onOpenChange,
  onAdded,
}: {
  detail: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (playerId: PlayerId) => void;
}) {
  const stacks = useStacks();
  const add = useAction(stacks.Client.mutation("guests", "add"));
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = String(new FormData(event.currentTarget).get("displayName")).trim();
    if (!displayName) return setNameError("Enter their name.");
    setNameError(null);
    const id = PlayerId.make(newId());
    const result = await add.run({
      params: { groupId: detail.group.id },
      payload: { id, displayName },
    });
    if (result) {
      onAdded?.(id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a guest"
      description="For a friend who isn't on Stacks yet. They can claim their history when they sign up."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" error={nameError}>
          {(props) => <Input {...props} name="displayName" maxLength={60} autoComplete="off" />}
        </Field>
        {add.error ? <FormError>{add.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={add.pending}>
          {add.pending ? "Adding…" : "Add guest"}
        </Button>
      </form>
    </Dialog>
  );
}

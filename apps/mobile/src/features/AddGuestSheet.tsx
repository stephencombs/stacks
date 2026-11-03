import { PlayerId, type GroupDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { useState } from "react";

import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { useAction, useStacks } from "../lib/stacks";

export function AddGuestSheet({
  detail,
  open,
  onClose,
  onAdded,
}: {
  detail: GroupDetail;
  open: boolean;
  onClose: () => void;
  onAdded?: (playerId: PlayerId) => void;
}) {
  const stacks = useStacks();
  const add = useAction(stacks.Client.mutation("guests", "add"));
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setNameError("Enter their name.");
    setNameError(null);
    const id = PlayerId.make(newId());
    if (
      await add.run({
        params: { groupId: detail.group.id },
        payload: { id, displayName: name.trim() },
      })
    ) {
      onAdded?.(id);
      setName("");
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a guest"
      description="For a friend who isn't on Color Up yet. They can claim their history when they sign up."
      footer={
        <Button
          label="Add guest"
          variant="primary"
          size="lg"
          pending={add.pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        maxLength={60}
        autoFocus
        error={nameError}
      />
      {add.error ? <FormError>{add.error}</FormError> : null}
    </Sheet>
  );
}

import { useState } from "react";

import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";

/** A one-field sheet for renaming. `onSave` gets the trimmed name and resolves true when it took. */
export function NameSheet({
  title,
  label,
  initial,
  maxLength,
  emptyError,
  onSave,
  onClose,
  pending,
  error,
}: {
  title: string;
  label: string;
  initial: string;
  maxLength: number;
  emptyError: string;
  onSave: (name: string) => Promise<boolean>;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError(emptyError);
    setNameError(null);
    if (trimmed === initial || (await onSave(trimmed))) onClose();
  };

  return (
    <Sheet
      open
      busy={pending}
      onClose={onClose}
      title={title}
      footer={
        <Button
          label="Save"
          variant="primary"
          size="lg"
          pending={pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label={label}
        value={name}
        onChangeText={setName}
        maxLength={maxLength}
        autoFocus
        error={nameError}
      />
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
  );
}

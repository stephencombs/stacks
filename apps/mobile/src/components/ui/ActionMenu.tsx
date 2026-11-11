import { useState } from "react";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export type ActionMenuProps = {
  label: string;
  disabled?: boolean;
  actions: ReadonlyArray<{
    label: string;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }>;
};

export function ActionMenu({ label, actions, disabled = false }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        accessibilityLabel={label}
        disabled={disabled}
        icon={<Icon name="more" color="ink" size={20} />}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <Sheet open title={label} onClose={() => setOpen(false)}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              disabled={action.disabled}
              variant={action.destructive ? "danger" : "secondary"}
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
            />
          ))}
        </Sheet>
      ) : null}
    </>
  );
}

import { useState, type ReactNode } from "react";
import { Pressable } from "react-native";
import { Button, IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

export type ActionMenuProps = {
  label: string;
  disabled?: boolean;
  /** What opens the menu, in place of the "…" button: a floating action button. */
  trigger?: ReactNode;
  actions: ReadonlyArray<{
    label: string;
    icon?: IconName;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }>;
};

export function ActionMenu({ label, actions, disabled = false, trigger }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setOpen(true)}
        >
          {trigger}
        </Pressable>
      ) : (
        <IconButton
          accessibilityLabel={label}
          disabled={disabled}
          icon={<Icon name="more" color="ink" size={20} />}
          onPress={() => setOpen(true)}
        />
      )}
      {open ? (
        <Sheet open title={label} onClose={() => setOpen(false)}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={action.label}
              icon={
                action.icon ? (
                  <Icon name={action.icon} color={action.destructive ? "loss" : "ink"} />
                ) : undefined
              }
              className={action.icon ? "justify-start" : undefined}
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

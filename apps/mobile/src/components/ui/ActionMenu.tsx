import { useState } from "react";
import { Pressable } from "react-native";
import { Button, IconButton } from "./Button";
import { GlassSurface } from "./GlassSurface";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

export type ActionMenuProps = {
  label: string;
  disabled?: boolean;
  /** Opens from a floating "+" button, a screen's main way to add, instead of the "…" button. */
  fab?: boolean;
  vertical?: boolean;
  felt?: boolean;
  actions: ReadonlyArray<{
    label: string;
    icon?: IconName;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }>;
};

export function ActionMenu({
  label,
  actions,
  disabled = false,
  fab = false,
  vertical = false,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {fab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setOpen(true)}
        >
          <GlassSurface className="size-14 items-center justify-center rounded-full">
            <Icon name="plus" color="ink" size={26} />
          </GlassSurface>
        </Pressable>
      ) : (
        <IconButton
          accessibilityLabel={label}
          disabled={disabled}
          icon={<Icon name={vertical ? "more-vertical" : "more"} color="ink" size={20} />}
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

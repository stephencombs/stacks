import { useState } from "react";
import { Switch as NativeSwitch, type SwitchProps } from "react-native";

/**
 * React Native's `Switch` snaps the native control back to `value` whenever it re-renders after a
 * tap with a `value` that hasn't caught up. Content portaled into a sheet always renders once like
 * that, because the owner's state update reaches it a commit later. Rendering the tapped value
 * locally keeps that render from undoing the tap. React Native also pins an iOS switch to
 * `alignSelf: "flex-start"`, so it is centred in its row here.
 */
export function Switch({ value, onValueChange, style, ...props }: SwitchProps) {
  const [shown, setShown] = useState(value);
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setShown(value);
  }

  return (
    <NativeSwitch
      {...props}
      style={[{ alignSelf: "center" }, style]}
      value={shown}
      onValueChange={(next) => {
        setShown(next);
        onValueChange?.(next);
      }}
    />
  );
}

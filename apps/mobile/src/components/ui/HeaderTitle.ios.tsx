import { Host } from "@expo/ui";
import { Button, Popover, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import type { HeaderTitleProps } from "./HeaderTitle";

export function HeaderTitle({ title, context, onExpand }: HeaderTitleProps) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const { theme } = useUniwind();
  const ink = String(useCSSVariable("--color-ink"));
  const trigger = (
    <Button
      label={title}
      systemImage="chevron.down"
      modifiers={[
        buttonStyle("glass"),
        buttonBorderShape("capsule"),
        foregroundStyle(ink),
        font({ size: 17, weight: "semibold" }),
        lineLimit(1),
        frame({ minHeight: 44, maxWidth: Math.max(120, width - 192) }),
        accessibilityLabel(title),
        accessibilityHint(onExpand ? "Show group and trip details" : "Show screen details"),
      ]}
      onPress={onExpand ?? (() => setOpen(true))}
    />
  );
  return (
    <Host matchContents colorScheme={theme === "light" ? "light" : "dark"}>
      {onExpand ? (
        trigger
      ) : (
        <Popover isPresented={open} onIsPresentedChange={setOpen}>
          <Popover.Trigger>{trigger}</Popover.Trigger>
          <Popover.Content>
            <VStack spacing={12} modifiers={[padding({ all: 20 }), frame({ maxWidth: 320 })]}>
              <Text modifiers={[font({ size: 20, weight: "semibold" })]}>{title}</Text>
              {context ? <Text>{context}</Text> : null}
              <Button
                label="Done"
                onPress={() => setOpen(false)}
                modifiers={[frame({ minHeight: 44 })]}
              />
            </VStack>
          </Popover.Content>
        </Popover>
      )}
    </Host>
  );
}

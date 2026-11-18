import type { MenuComponentProps } from "@expo/ui/community/menu";
import {
  DropdownMenu,
  DropdownMenuItem,
  RNHostView,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";

// Clipped popups drop the status bar offset, so edge-to-edge menus near the bottom detach from
// their anchor.
const popup = { clippingEnabled: false };

/**
 * The menu behind a trigger, as Material's dropdown, drawn from the app's tokens. It takes the
 * same props as `@expo/ui`'s own `MenuView`, whose host paints from the wallpaper palette; only
 * what Color Up's menus use is here: flat actions, with a check on the chosen one.
 */
export function MenuView({
  actions,
  onPressAction,
  shouldOpenOnLongPress,
  style,
  testID,
  children,
}: MenuComponentProps) {
  const [expanded, setExpanded] = useState(false);
  const loss = String(useCSSVariable("--color-loss"));
  return (
    <View style={style} testID={testID}>
      <Host matchContents>
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={() => setExpanded(false)}
          properties={popup}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              <Pressable
                onPress={shouldOpenOnLongPress ? undefined : () => setExpanded(true)}
                onLongPress={shouldOpenOnLongPress ? () => setExpanded(true) : undefined}
                android_disableSound
                focusable={false}
                accessible={false}
              >
                {children}
              </Pressable>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {actions
              .filter((action) => !action.attributes?.hidden)
              .map((action) => (
                <DropdownMenuItem
                  key={action.id ?? action.title}
                  enabled={!action.attributes?.disabled}
                  elementColors={
                    action.attributes?.destructive
                      ? { textColor: loss, disabledTextColor: loss }
                      : undefined
                  }
                  onClick={() => {
                    onPressAction?.({ nativeEvent: { event: action.id ?? action.title } });
                    setExpanded(false);
                  }}
                >
                  <DropdownMenuItem.Text>
                    <ComposeText>{action.title}</ComposeText>
                  </DropdownMenuItem.Text>
                  {action.state === "on" ? (
                    <DropdownMenuItem.TrailingIcon>
                      <ComposeText>✓</ComposeText>
                    </DropdownMenuItem.TrailingIcon>
                  ) : null}
                </DropdownMenuItem>
              ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}

import type { MenuComponentProps } from "@expo/ui/community/menu";
import * as Predicate from "effect/Predicate";
import {
  DropdownMenu,
  DropdownMenuItem,
  Icon as ComposeIcon,
  RNHostView,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";

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
  const [loss, ink] = useCSSVariable(["--color-loss", "--color-ink"]).map(String);

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
              .map((action) => {
                const leading =
                  action.image && !Predicate.isString(action.image) ? action.image : undefined;

                return (
                  <DropdownMenuItem
                    key={action.id ?? action.title}
                    enabled={!action.attributes?.disabled}
                    elementColors={
                      action.attributes?.destructive
                        ? {
                            textColor: loss,
                            disabledTextColor: loss,
                            leadingIconColor: loss,
                            disabledLeadingIconColor: loss,
                          }
                        : undefined
                    }
                    onClick={() => {
                      onPressAction?.({ nativeEvent: { event: action.id ?? action.title } });
                      setExpanded(false);
                    }}
                  >
                    {leading ? (
                      <DropdownMenuItem.LeadingIcon>
                        <ComposeIcon
                          source={leading}
                          size={20}
                          tint={action.attributes?.destructive ? loss : ink}
                        />
                      </DropdownMenuItem.LeadingIcon>
                    ) : null}
                    <DropdownMenuItem.Text>
                      <ComposeText>{action.title}</ComposeText>
                    </DropdownMenuItem.Text>
                    {action.state === "on" ? (
                      <DropdownMenuItem.TrailingIcon>
                        <ComposeText>✓</ComposeText>
                      </DropdownMenuItem.TrailingIcon>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}

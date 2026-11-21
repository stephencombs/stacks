import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { AndroidFilterChip } from "../components/ui/FilterChip.native";
import type { FilterChipProps } from "../components/ui/FilterChip";

const paths = {
  all: "M7.5 8a4 4 0 0 0 0 8c2.2 0 3.6-2.6 4.5-4s2.3-4 4.5-4a4 4 0 0 1 0 8c-1 0-1.9-.5-2.7-1.3",
  year: "M6 4v4m12-4v4M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  person: "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Z",
  group:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1Zm16-5a4 4 0 0 1 4 4v1m-6-14a3 3 0 0 1 0 6",
  check: "m5 12 4 4L19 6",
};

type MenuOption = {
  readonly value: string;
  readonly label: string;
  readonly icon?: keyof typeof paths;
  readonly subtitle?: string;
};

function MenuIcon({ name, color }: { name: keyof typeof paths; color: string }) {
  // SAFETY: this specifier is the installed Jetpack Compose module on Android.
  const { RNHostView } =
    require("@expo/ui/jetpack-compose") as typeof import("@expo/ui/jetpack-compose");

  return (
    <RNHostView matchContents>
      <Svg width={22} height={22} viewBox="0 0 24 24" importantForAccessibility="no">
        <Path
          d={paths[name]}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </RNHostView>
  );
}

export function StatsMenu({
  options,
  menuState,
  ...props
}: Omit<FilterChipProps<string>, "options"> & {
  options: ReadonlyArray<MenuOption>;
  menuState?: { readonly open: boolean; readonly setOpen: (open: boolean) => void };
}) {
  // SAFETY: this specifier is the installed Jetpack Compose module on Android.
  const {
    Column,
    DropdownMenu,
    DropdownMenuItem,
    RNHostView,
    Text: ComposeText,
  } = require("@expo/ui/jetpack-compose") as typeof import("@expo/ui/jetpack-compose");

  // SAFETY: this specifier is the installed Compose modifiers module on Android.
  const { background, width } =
    require("@expo/ui/jetpack-compose/modifiers") as typeof import("@expo/ui/jetpack-compose/modifiers");

  // SAFETY: this relative specifier is this app's Compose host module.
  const { ComposeHost } =
    require("../components/ui/ComposeHost.android") as typeof import("../components/ui/ComposeHost.android");

  const [open, setOpen] = useState(false);
  const expanded = menuState?.open ?? open;
  const setExpanded = menuState?.setOpen ?? setOpen;

  const [ink, muted, surface, fill] = useCSSVariable([
    "--color-ink",
    "--color-muted",
    "--color-surface",
    "--color-fill",
  ]).map(String);

  const label = options.find((option) => option.value === props.value)?.label ?? "";

  return (
    <AndroidFilterChip {...props} label={label}>
      {(face) => (
        <ComposeHost matchContents>
          <DropdownMenu
            expanded={expanded}
            onDismissRequest={() => setExpanded(false)}
            properties={{ clippingEnabled: false }}
            color={surface}
            cornerRadius={14}
          >
            <DropdownMenu.Trigger>
              <RNHostView matchContents>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${props.name}: ${label}`}
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded(true)}
                >
                  {face}
                </Pressable>
              </RNHostView>
            </DropdownMenu.Trigger>
            <DropdownMenu.Items>
              {options.map((option) => {
                const selected = option.value === props.value;

                return (
                  <DropdownMenuItem
                    key={option.value}
                    modifiers={[
                      width(props.name === "Group" ? 252 : 232),
                      ...(selected ? [background(fill!)] : []),
                    ]}
                    onClick={() => {
                      setExpanded(false);
                      props.onChange(option.value);
                    }}
                  >
                    {option.icon ? (
                      <DropdownMenuItem.LeadingIcon>
                        <MenuIcon name={option.icon} color={muted!} />
                      </DropdownMenuItem.LeadingIcon>
                    ) : null}
                    <DropdownMenuItem.Text>
                      <Column>
                        <ComposeText color={ink} style={{ fontSize: 16 }}>
                          {option.label}
                        </ComposeText>
                        {option.subtitle ? (
                          <ComposeText color={muted} style={{ fontSize: 12 }}>
                            {option.subtitle}
                          </ComposeText>
                        ) : null}
                      </Column>
                    </DropdownMenuItem.Text>
                    {selected ? (
                      <DropdownMenuItem.TrailingIcon>
                        <MenuIcon name="check" color={muted!} />
                      </DropdownMenuItem.TrailingIcon>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenu.Items>
          </DropdownMenu>
        </ComposeHost>
      )}
    </AndroidFilterChip>
  );
}

export function StatsChipTrigger({
  name,
  label,
  applied,
  onClear,
  onPress,
}: Pick<FilterChipProps<string>, "name" | "applied" | "onClear"> & {
  label: string;
  onPress: () => void;
}) {
  return (
    <AndroidFilterChip name={name} label={label} applied={applied} onClear={onClear}>
      {(face) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}: ${label}`}
          onPress={onPress}
        >
          {face}
        </Pressable>
      )}
    </AndroidFilterChip>
  );
}

export function StatsRadio({ selected }: { selected: boolean }) {
  // SAFETY: this specifier is the installed Jetpack Compose module on Android.
  const { RadioButton } =
    require("@expo/ui/jetpack-compose") as typeof import("@expo/ui/jetpack-compose");

  // SAFETY: this relative specifier is this app's Compose host module.
  const { ComposeHost } =
    require("../components/ui/ComposeHost.android") as typeof import("../components/ui/ComposeHost.android");

  return (
    <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <ComposeHost matchContents>
        <RadioButton selected={selected} />
      </ComposeHost>
    </View>
  );
}

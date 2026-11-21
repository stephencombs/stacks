import { Switch as ComposeSwitch } from "@expo/ui/jetpack-compose";
import { semantics } from "@expo/ui/jetpack-compose/modifiers";
import type { SwitchProps } from "react-native";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";

/**
 * Material 3's switch, drawn from the app's tokens. On, the track is ink and the thumb sits inside
 * it in the inverse colour; off, an outlined track holds a faint thumb. Both read in light and dark.
 */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: SwitchProps) {
  const [ink, inverse, fill, faint] = useCSSVariable([
    "--color-ink",
    "--color-ink-inverse",
    "--color-fill",
    "--color-faint",
  ]);

  return (
    <Host matchContents>
      <ComposeSwitch
        value={!!value}
        enabled={!disabled}
        {...(onValueChange ? { onCheckedChange: onValueChange } : {})}
        colors={{
          checkedTrackColor: ink,
          checkedThumbColor: inverse,
          checkedBorderColor: ink,
          uncheckedTrackColor: fill,
          uncheckedThumbColor: faint,
          uncheckedBorderColor: faint,
        }}
        modifiers={
          accessibilityLabel ? [semantics({ contentDescription: accessibilityLabel })] : []
        }
      />
    </Host>
  );
}

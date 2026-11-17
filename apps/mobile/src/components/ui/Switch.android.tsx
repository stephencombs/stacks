import { Switch as NativeSwitch, type SwitchProps } from "react-native";
import { useCSSVariable } from "uniwind";

/** Android draws a switch from the app's tokens, not the system accent. */
export function Switch(props: SwitchProps) {
  const [ink, inverse, strong, faint] = useCSSVariable([
    "--color-ink",
    "--color-ink-inverse",
    "--color-fill-strong",
    "--color-faint",
  ]).map(String);
  return (
    <NativeSwitch
      trackColor={{ false: strong, true: ink }}
      thumbColor={props.value ? inverse : faint}
      {...props}
    />
  );
}

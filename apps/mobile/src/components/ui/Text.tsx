import type { ComponentProps } from "react";
import { Text as NativeText } from "react-native";

const textStyle = { fontFamily: "Allo" };

export function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[textStyle, style]} />;
}

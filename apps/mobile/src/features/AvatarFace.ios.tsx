import { initialsOf } from "@stacks/client-runtime/avatar";
import User from "lucide-react-native/icons/user";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Text } from "../components/ui/Text";

/** iOS Contacts' monogram: a soft grey vertical gradient with white initials, up to two. */
export function AvatarFace({ name, size }: { name: string; size: number; playerId: string }) {
  const [top, bottom, ink] = useCSSVariable([
    "--color-avatar-top",
    "--color-avatar-bottom",
    "--color-avatar-ink",
  ]);

  const initials = initialsOf(name, 2);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center overflow-hidden"
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="avatar" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={String(top)} />
            <Stop offset="1" stopColor={String(bottom)} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#avatar)" />
      </Svg>
      {initials === "" ? (
        <User size={size * 0.56} color={String(ink)} fill={String(ink)} strokeWidth={1.5} />
      ) : (
        <Text
          maxFontSizeMultiplier={1}
          style={{
            color: String(ink),
            fontSize: size * (initials.length > 1 ? 0.38 : 0.44),
            fontWeight: "600",
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

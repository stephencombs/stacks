import { avatarToneOf, initialsOf } from "@stacks/client-runtime/avatar";
import User from "lucide-react-native/icons/user";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

/** Android Contacts' letter tile: one initial on a tonal color a player's ID picks. */
export function AvatarFace({
  name,
  playerId,
  size,
}: {
  name: string;
  playerId: string;
  size: number;
}) {
  const tone = avatarToneOf(playerId);
  const [ground, ink] = useCSSVariable([`--color-avatar-${tone}`, `--color-avatar-${tone}-ink`]);
  const initial = initialsOf(name, 1);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: String(ground),
      }}
      className="items-center justify-center"
    >
      {initial === "" ? (
        <User size={size * 0.56} color={String(ink)} fill={String(ink)} strokeWidth={1.5} />
      ) : (
        <Text
          maxFontSizeMultiplier={1}
          style={{ color: String(ink), fontSize: size * 0.46, fontWeight: "500" }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

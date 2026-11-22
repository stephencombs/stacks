import { useUser } from "@clerk/expo";
import { useState } from "react";
import { Image, Platform, View } from "react-native";

import { Chip } from "./Chip";

/** The signed-in user's profile photo when Clerk has one, falling back to their Color Up chip. */
export function UserAvatar({
  size = 32,
  fallbackName = "You",
  ring = Platform.OS === "android",
}: {
  size?: number;
  fallbackName?: string;
  ring?: boolean;
}) {
  const { user } = useUser();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = user?.hasImage && user.imageUrl ? user.imageUrl : null;

  const name =
    Platform.OS === "android"
      ? (user?.fullName ?? user?.firstName ?? fallbackName)
      : (user?.firstName ?? user?.fullName ?? fallbackName);

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="overflow-hidden border border-line/50 bg-fill"
      >
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      </View>
    );
  }

  return <Chip chip={Platform.OS === "android" ? 5 : 1} name={name} size={size} ring={ring} />;
}

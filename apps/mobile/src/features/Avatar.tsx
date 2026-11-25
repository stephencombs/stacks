import { useState } from "react";
import { Image, View } from "react-native";

import { AvatarFace } from "./AvatarFace";

export interface AvatarProps {
  readonly name: string;
  /** What picks a letter tile's color on Android; it never changes for a player. */
  readonly playerId: string;
  /** A photo to show. A photo that won't load goes back to the default avatar. */
  readonly image?: string | null | undefined;
  readonly size?: number;
}

/**
 * A person the way the phone's Contacts app draws them: their photo when there is one, otherwise
 * the platform's default avatar, which is a grey monogram on iOS and a colored letter tile on
 * Android. It's decoration beside a name, so assistive tech skips it.
 */
export function Avatar({ image, ...face }: AvatarProps) {
  return image ? (
    <Photo key={image} image={image} {...face} />
  ) : (
    <AvatarFace {...face} size={face.size ?? 32} />
  );
}

function Photo({ image, ...face }: AvatarProps & { image: string }) {
  const [failed, setFailed] = useState(false);
  const size = face.size ?? 32;

  if (failed) return <AvatarFace {...face} size={size} />;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-fill"
    >
      <Image
        source={{ uri: image }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

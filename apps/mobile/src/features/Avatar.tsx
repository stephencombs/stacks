import { useState } from "react";
import { Image, View } from "react-native";

import { AvatarFace } from "./AvatarFace";

export interface AvatarProps {
  readonly name: string;
  /** What picks a letter tile's color on Android; it never changes for a player. */
  readonly playerId: string;
  /** Photos to try in order. One that won't load, or none, falls back to the default avatar. */
  readonly image?: string | null | ReadonlyArray<string | null | undefined> | undefined;
  readonly size?: number;
}

/**
 * A person the way the phone's Contacts app draws them: their photo when there is one, otherwise
 * the platform's default avatar, which is a grey monogram on iOS and a colored letter tile on
 * Android. It's decoration beside a name, so assistive tech skips it.
 */
export function Avatar({ image, ...face }: AvatarProps) {
  const sources = [image].flat().filter((source) => !!source);

  return sources.length > 0 ? (
    <Photo key={sources.join("\n")} sources={sources} {...face} />
  ) : (
    <AvatarFace {...face} size={face.size ?? 32} />
  );
}

function Photo({
  sources,
  ...face
}: Omit<AvatarProps, "image"> & { sources: ReadonlyArray<string | null | undefined> }) {
  const [failed, setFailed] = useState(0);
  const size = face.size ?? 32;
  const uri = sources[failed];

  if (!uri) return <AvatarFace {...face} size={size} />;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-fill"
    >
      <Image
        key={uri}
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        onError={() => setFailed(failed + 1)}
      />
    </View>
  );
}

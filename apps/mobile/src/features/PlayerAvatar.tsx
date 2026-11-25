import type { PlayerId } from "@stacks/contracts";
import { Platform } from "react-native";

import { useContactPhoto } from "../lib/contactPhotos";
import { Avatar } from "./Avatar";
import { UserAvatar } from "./UserAvatar";

/** A player's avatar at a table, 36pt on Android and 32pt on iOS. */
export const TABLE_AVATAR_SIZE = Platform.OS === "android" ? 36 : 32;

/**
 * A player's avatar, with the photo linked to them on this phone when there is one. `you` marks
 * the signed-in user's own player, who falls back to their profile photo and their own initials.
 */
export function PlayerAvatar({
  playerId,
  name,
  size,
  you = false,
}: {
  playerId: PlayerId;
  name: string;
  size?: number;
  you?: boolean;
}) {
  const photo = useContactPhoto(playerId);

  return you ? (
    <UserAvatar size={size} fallbackName={name} contactPhoto={photo} />
  ) : (
    <Avatar name={name} playerId={playerId} image={photo} size={size} />
  );
}

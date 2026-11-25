import { useUser } from "@clerk/expo";

import { Avatar } from "./Avatar";

/**
 * The signed-in user's avatar: a photo linked on this phone, else their Clerk profile photo, else
 * the default avatar with their own initials. `playerId` keeps their Android tile one color in a group.
 */
export function UserAvatar({
  size = 32,
  fallbackName = "You",
  playerId = "you",
  contactPhoto = null,
}: {
  size?: number;
  fallbackName?: string;
  playerId?: string;
  contactPhoto?: string | null;
}) {
  const { user } = useUser();
  const profile = user?.hasImage && user.imageUrl ? user.imageUrl : null;

  return (
    <Avatar
      name={user?.fullName ?? user?.firstName ?? fallbackName}
      playerId={playerId}
      image={contactPhoto ?? profile}
      size={size}
    />
  );
}

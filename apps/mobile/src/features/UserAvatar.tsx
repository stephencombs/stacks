import { useUser } from "@clerk/expo";

import { useAccount } from "../lib/account";
import { Avatar } from "./Avatar";

type Props = { size?: number; fallbackName?: string; contactPhoto?: string | null };

/**
 * The signed-in user's avatar: a photo linked on this phone, else their Clerk profile photo, else
 * the default avatar with their own initials. Without Clerk in this build it keeps `fallbackName`.
 * Their Clerk user ID picks the Android tile's color, so it matches everywhere they appear.
 */
export function UserAvatar(props: Props) {
  const account = useAccount();

  return account.available ? (
    <ClerkAvatar {...props} userId={account.userId ?? null} />
  ) : (
    <Face {...props} userId={null} />
  );
}

function ClerkAvatar({ userId, ...props }: Props & { userId: string | null }) {
  const { user } = useUser();
  const profile = user?.hasImage && user.imageUrl ? user.imageUrl : null;

  return (
    <Face
      {...props}
      userId={userId}
      name={user?.fullName ?? user?.firstName ?? null}
      profile={profile}
    />
  );
}

function Face({
  size = 32,
  fallbackName = "You",
  contactPhoto = null,
  userId,
  name = null,
  profile = null,
}: Props & { userId: string | null; name?: string | null; profile?: string | null }) {
  return (
    <Avatar
      name={name ?? fallbackName}
      playerId={userId ?? "you"}
      image={[contactPhoto, profile]}
      size={size}
    />
  );
}

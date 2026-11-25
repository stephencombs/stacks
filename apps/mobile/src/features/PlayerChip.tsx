import { tableChipOf } from "@stacks/client-runtime/trip";
import type { PlayerId } from "@stacks/contracts";
import { Platform } from "react-native";

import { useContactPhoto } from "../lib/contactPhotos";
import { Chip, type ChipProps } from "./Chip";

/** A player's chip, with the photo linked to them on this phone when there is one. */
export function PlayerChip({ playerId, ...props }: ChipProps & { playerId: PlayerId }) {
  return <Chip photoUri={useContactPhoto(playerId)} {...props} />;
}

/** A player's chip at a table, which has no group to number players by, so the color follows their ID. */
export function TableChip({ playerId, name }: { playerId: PlayerId; name: string }) {
  const android = Platform.OS === "android";

  return (
    <PlayerChip
      playerId={playerId}
      chip={tableChipOf(playerId)}
      name={name}
      size={android ? 36 : 32}
      ring={android}
    />
  );
}

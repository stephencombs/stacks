import type { StatsCopyStorage } from "@stacks/client-runtime/statsCopy";
import type { LastTripStorage } from "@stacks/client-runtime/trip";
import { Directory, File, Paths } from "expo-file-system";

export const lastTripStorage: (userId: string) => LastTripStorage = (userId) => {
  const key = `last-trip-${userId}`;
  const file = new File(Paths.document, key);

  return {
    load: () => (file.exists ? file.textSync() : null),
    save: (value: string | null) => {
      if (value === null) {
        if (file.exists) file.delete();
      } else file.writeSync(value);
    },
  };
};

/** The last copy of each group's stats, so the group view still shows offline. */
export const statsCopyStorage: (userId: string) => StatsCopyStorage = (userId) => {
  const key = (groupId: string) => `stats-${userId}-${groupId}`;
  const file = (groupId: string) => new File(Paths.document, `${key(groupId)}.json`);

  return {
    load: (groupId) => {
      const kept = file(groupId);

      return kept.exists ? kept.textSync() : null;
    },
    save: (groupId, value) => {
      const kept = file(groupId);

      if (value !== null) kept.writeSync(value);
      else if (kept.exists) kept.delete();
    },
  };
};

/** Drops a person's last trip and every group's stats copy the phone kept for them. */
export const deleteTripFiles = (userId: string) => {
  const lastTrip = new File(Paths.document, `last-trip-${userId}`);

  if (lastTrip.exists) lastTrip.delete();

  for (const entry of new Directory(Paths.document).list()) {
    if (entry instanceof File && entry.name.startsWith(`stats-${userId}-`)) entry.delete();
  }
};

import type { StatsCopyStorage } from "@stacks/client-runtime/statsCopy";
import type { LastTripStorage } from "@stacks/client-runtime/trip";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

export const lastTripStorage = (userId: string): LastTripStorage => {
  const key = `last-trip-${userId}`;
  if (Platform.OS === "web")
    return {
      load: () => localStorage.getItem(key),
      save: (value: string | null) =>
        value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value),
    };
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
export const statsCopyStorage = (userId: string): StatsCopyStorage => {
  const key = (groupId: string) => `stats-${userId}-${groupId}`;
  if (Platform.OS === "web")
    return {
      load: (groupId) => localStorage.getItem(key(groupId)),
      save: (groupId, value) =>
        value === null
          ? localStorage.removeItem(key(groupId))
          : localStorage.setItem(key(groupId), value),
    };
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

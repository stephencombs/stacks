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

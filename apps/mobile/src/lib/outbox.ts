import type { OutboxStorage } from "@stacks/client-runtime/outbox";
import { File, Paths } from "expo-file-system";
import { AppState } from "react-native";

/**
 * Entries waiting for signal live in a file, so closing the app doesn't lose them. Each person
 * signed in on the phone gets their own, so nobody sends someone else's entries.
 */
export const outboxStorage: (userId: string) => OutboxStorage = (userId) => {
  const file = new File(Paths.document, `outbox-${userId}.json`);

  return {
    load: () => (file.exists ? file.textSync() : null),
    save: (value) => file.writeSync(value),
  };
};

/** Coming back to the app is the moment signal has most likely returned. */
export const wakeOutbox = (flush: () => void) => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") flush();
  });

  return () => subscription.remove();
};

/** Drops a person's queued entries. */
export const deleteOutbox = (userId: string) => {
  const file = new File(Paths.document, `outbox-${userId}.json`);

  if (file.exists) file.delete();
};

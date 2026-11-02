import type { OutboxStorage } from "@stacks/client-runtime/outbox";
import { File, Paths } from "expo-file-system";
import { AppState, Platform } from "react-native";

/**
 * Entries waiting for signal live in a file, so closing the app doesn't lose them. Each person
 * signed in on the phone gets their own, so nobody sends someone else's entries.
 */
export const outboxStorage = (userId: string): OutboxStorage => {
  // The browser run of the app has no file system.
  if (Platform.OS === "web")
    return {
      load: () => localStorage.getItem(`stacks-outbox-${userId}`),
      save: (value) => localStorage.setItem(`stacks-outbox-${userId}`, value),
    };
  const file = new File(Paths.document, `outbox-${userId}.json`);
  let writing = Promise.resolve();
  return {
    load: () => (file.exists ? file.textSync() : null),
    save: (value) => {
      writing = writing.then(() => file.write(value)).catch(() => undefined);
    },
  };
};

/** Coming back to the app is the moment signal has most likely returned. */
export const wakeOutbox = (flush: () => void) => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") flush();
  });
  // In the browser run of the app, the browser also says when the connection is back.
  if (Platform.OS === "web") window.addEventListener("online", flush);
  return () => {
    subscription.remove();
    if (Platform.OS === "web") window.removeEventListener("online", flush);
  };
};

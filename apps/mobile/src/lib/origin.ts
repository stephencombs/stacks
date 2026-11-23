import { File, Paths } from "expo-file-system";

import { resolveOrigin } from "./originId";

const file = new File(Paths.document, "install-origin");

/**
 * Names this install to the API as `X-Origin`, so a notice for a write this phone made doesn't
 * make it refetch what it already has. Random, kept across launches, and not a secret.
 */
export const installOrigin = resolveOrigin({
  read: () => (file.exists ? file.textSync() : null),
  write: (value) => file.writeSync(value),
});

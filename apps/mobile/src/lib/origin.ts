import { newId } from "@stacks/client-runtime/ids";
import { File, Paths } from "expo-file-system";

const file = new File(Paths.document, "install-origin");

const load = () => {
  const saved = file.exists ? file.textSync().trim() : "";

  if (saved) return saved;
  const created = newId();
  file.writeSync(created);

  return created;
};

/**
 * Names this install to the API as `X-Origin`, so a notice for a write this phone made doesn't
 * make it refetch what it already has. Random, kept across launches, and not a secret.
 */
export const installOrigin = load();

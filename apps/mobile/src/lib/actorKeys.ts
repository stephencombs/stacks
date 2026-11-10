import { ActorCredential } from "@stacks/contracts/recordingCommands";
import type { ActorKeyStorage } from "@stacks/client-runtime/recordingReact";
import * as Schema from "effect/Schema";
import * as SecureStore from "expo-secure-store";

const KEY = "color-up-actor";
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(ActorCredential));

/** The device actor's secret, in the platform's keychain or keystore. */
export const actorKeys: ActorKeyStorage = {
  load: async () => {
    const saved = await SecureStore.getItemAsync(KEY);
    const credential = saved === null ? null : decode(saved);
    return credential?._tag === "Some" ? credential.value : null;
  },
  save: (credential) => SecureStore.setItemAsync(KEY, JSON.stringify(credential)),
};

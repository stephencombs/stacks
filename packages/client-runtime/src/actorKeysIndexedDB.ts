import { ActorCredential } from "@stacks/contracts/recordingCommands";
import * as Schema from "effect/Schema";

import type { ActorKeyStorage } from "./recordingSync.ts";

const DATABASE = "color-up-actor";
const KEYS = "keys";
const KEY = "device";

const decode = Schema.decodeUnknownOption(ActorCredential);

const request = <A>(open: (store: IDBObjectStore) => IDBRequest<A>, mode: IDBTransactionMode) =>
  new Promise<A>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.addEventListener("upgradeneeded", () => opening.result.createObjectStore(KEYS));
    opening.addEventListener("error", () => reject(opening.error));
    opening.addEventListener("success", () => {
      const database = opening.result;
      const transaction = database.transaction(KEYS, mode);
      const pending = open(transaction.objectStore(KEYS));
      transaction.addEventListener("complete", () => {
        database.close();
        resolve(pending.result);
      });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error);
      });
    });
  });

/**
 * The browser's device actor secret, in its own IndexedDB database: apart from the ledger, so
 * exporting or inspecting recorded play never carries it.
 */
export const indexedDBActorKeys: ActorKeyStorage = {
  load: async () => {
    const value = await request((store) => store.get(KEY), "readonly");
    const credential = decode(value);
    return credential._tag === "Some" ? credential.value : null;
  },
  save: async (credential) => {
    await request((store) => store.put(credential, KEY), "readwrite");
  },
};

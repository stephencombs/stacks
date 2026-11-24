import { getClerkInstance } from "@clerk/expo";

import { clerkPublishableKey } from "./config";

export const clerk = () => getClerkInstance({ publishableKey: clerkPublishableKey });

/** The signed-in session's token. `fresh` mints a new one instead of using the cached copy. */
export const sessionToken = async (fresh = false) =>
  (await clerk().session?.getToken(fresh ? { skipCache: true } : undefined)) ?? null;

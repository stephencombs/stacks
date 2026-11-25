import { getClerkInstance, isClerkAPIResponseError } from "@clerk/expo";

import { clerkPublishableKey } from "./config";

export const clerk = () => getClerkInstance({ publishableKey: clerkPublishableKey });

/**
 * The current session's token, or null when signed out. When Clerk refuses to refresh because the
 * session or its user is gone, as after the account was deleted on another device, this signs
 * out and keeps the phone's files. Other failures, like no signal, still reject.
 */
export const sessionToken = async () => {
  try {
    return (await clerk().session?.getToken()) ?? null;
  } catch (error) {
    const gone = isClerkAPIResponseError(error) && (error.status === 401 || error.status === 404);

    if (!gone) throw error;

    await clerk().signOut();

    return null;
  }
};

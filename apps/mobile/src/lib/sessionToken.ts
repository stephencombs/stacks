import { getClerkInstance } from "@clerk/expo";

import { clerkPublishableKey } from "./config";

export const clerk = () => getClerkInstance({ publishableKey: clerkPublishableKey });

export const sessionToken = async () => (await clerk().session?.getToken()) ?? null;

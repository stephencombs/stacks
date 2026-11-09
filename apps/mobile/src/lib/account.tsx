import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { createContext, use, useEffect, useMemo, type ReactNode } from "react";

import { clerkPublishableKey } from "./config";
import { markStartup } from "./diagnostics";

type Account =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly isLoaded: boolean;
      readonly isSignedIn: boolean | undefined;
      readonly userId: string | null | undefined;
    };

const AccountContext = createContext<Account>({ available: false });

/**
 * Sign-in, when this build has it. Private recording never waits for it: without a key, or
 * while Clerk loads or fails offline, your play works and only groups and trips wait.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey) return children;
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkAccount>{children}</ClerkAccount>
    </ClerkProvider>
  );
}

function ClerkAccount({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    if (isLoaded) markStartup("auth_ready");
  }, [isLoaded]);
  const account = useMemo(
    () => ({ available: true as const, isLoaded, isSignedIn, userId }),
    [isLoaded, isSignedIn, userId],
  );
  return <AccountContext value={account}>{children}</AccountContext>;
}

export const useAccount = () => use(AccountContext);

import { ClerkProvider, useAuth } from "@clerk/react";
import { createContext, use, useMemo, type ReactNode } from "react";

type Account =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly isLoaded: boolean;
      readonly isSignedIn: boolean | undefined;
      readonly userId: string | null | undefined;
    };

const AccountContext = createContext<Account>({ available: false });

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Sign-in, when this build has it. Private recording never waits for it: without a key, or
 * while Clerk loads or fails offline, the personal pages work and only account pages wait.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) return children;
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={{
        // The palette's variables switch with the theme, so Clerk follows it too.
        variables: {
          colorPrimary: "var(--color-accent)",
          colorPrimaryForeground: "var(--color-accent-ink)",
          colorBackground: "var(--color-surface)",
          colorForeground: "var(--color-ink)",
          colorMutedForeground: "var(--color-muted)",
          colorNeutral: "var(--color-ink)",
          colorInput: "var(--color-surface)",
          colorInputForeground: "var(--color-ink)",
          colorDanger: "var(--color-danger)",
          borderRadius: "0.625rem",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
        // Padding grows the avatar's hit area to 44px without changing how it looks.
        elements: { userButtonTrigger: "-m-2 p-2" },
      }}
    >
      <ClerkAccount>{children}</ClerkAccount>
    </ClerkProvider>
  );
}

function ClerkAccount({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const account = useMemo(
    () => ({ available: true as const, isLoaded, isSignedIn, userId }),
    [isLoaded, isSignedIn, userId],
  );
  return <AccountContext value={account}>{children}</AccountContext>;
}

export const useAccount = () => use(AccountContext);

import { ClerkFailed, useAuth } from "@clerk/react";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { FormError } from "~/components/ui/Field";
import { Menu, MenuChoice } from "~/components/ui/Menu";
import { Landing } from "~/features/Landing";
import { AppShell, Wordmark, You } from "~/features/Shell";
import { StacksProvider } from "~/lib/stacks";
import { setTheme, useTheme } from "~/lib/theme";

export const Route = createRootRoute({ component: Root });

/** Opening an invite or claim link happens before you're in the group, so it has no places yet. */
const invitation = /^\/(join|claim)\//;

function Root() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { pathname } = useLocation();
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId} userId={userId}>
      {invitation.test(pathname) ? (
        <Frame tools={<You layout="bar" />}>
          <main className="flex w-full flex-1 flex-col gap-8 pt-2 pb-16 lg:mx-auto lg:max-w-2xl">
            <Outlet />
          </main>
        </Frame>
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
    </StacksProvider>
  );
}

/**
 * The column a page sits in under the wordmark, for everything outside the app's places: signing
 * in and opening an invitation.
 */
function Frame({ tools, children }: { tools?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:max-w-[1200px] lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]">
      <div className="flex h-16 shrink-0 items-center justify-between">
        <Wordmark />
        {tools}
      </div>
      {children}
    </div>
  );
}

function ThemeMenu() {
  const theme = useTheme();
  const Icon = theme === "light" ? Sun : Moon;
  return (
    <Menu label="Theme" icon={<Icon className="size-5" aria-hidden />}>
      <MenuChoice options={themeChoices} value={theme} onChange={setTheme} />
    </Menu>
  );
}

function Loading() {
  return (
    <Frame>
      <ClerkFailed>
        <main className="pt-16">
          <FormError>Couldn't load sign-in. Check your connection and reload the page.</FormError>
        </main>
      </ClerkFailed>
    </Frame>
  );
}

function SignedOut() {
  const { pathname } = useLocation();
  return (
    <Frame tools={<ThemeMenu />}>
      <Landing invited={invitation.test(pathname)} />
    </Frame>
  );
}

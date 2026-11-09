import { ClerkFailed } from "@clerk/react";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Outlet, createRootRoute, useLocation, useRouterState } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuChoice } from "~/components/ui/Menu";
import { Note } from "~/components/ui/Page";
import { Landing } from "~/features/Landing";
import { AppShell, Wordmark, You } from "~/features/Shell";
import { useAccount } from "~/lib/account";
import { SignedInProvider, StacksProvider } from "~/lib/stacks";
import { setTheme, useTheme } from "~/lib/theme";

export const Route = createRootRoute({ component: Root });

/** Opening an invite or claim link happens before you're in the group, so it has no places yet. */
const invitation = /^\/(join|claim)\//;

/** Your own play: it lives on this device, so it never waits for sign-in or the network. */
const personal = (pathname: string) => pathname === "/" || pathname.startsWith("/play/");

function Root() {
  // Decide from the page being drawn, not the address: while a navigation is pending the router
  // still renders the previous page, which needs the providers it had.
  const pathname = useRouterState({
    select: (state) => state.matches.at(-1)?.pathname ?? state.location.pathname,
  });
  // Your play keeps this same element signed in or out, so sign-in never remounts it.
  return <SignedInProvider>{personal(pathname) ? <Outlet /> : <Accounts />}</SignedInProvider>;
}

/** Groups, trips and their sessions belong to an account, so they need one signed in. */
function Accounts() {
  const account = useAccount();
  const { pathname } = useLocation();
  if (!account.available) return <NoSignIn />;
  if (!account.isLoaded) return <Loading />;
  if (!account.isSignedIn || !account.userId) return <SignedOut />;
  return (
    <StacksProvider key={account.userId}>
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

function BackToYourPlay() {
  return (
    <ButtonLink to="/" className="self-start">
      Back to your play
    </ButtonLink>
  );
}

function Loading() {
  return (
    <Frame>
      <ClerkFailed>
        <main className="flex flex-col gap-4 pt-16">
          <FormError>
            Couldn't load sign-in. Check your connection and reload the page. Your sessions on this
            device still work.
          </FormError>
          <BackToYourPlay />
        </main>
      </ClerkFailed>
    </Frame>
  );
}

function NoSignIn() {
  return (
    <Frame tools={<ThemeMenu />}>
      <main className="flex flex-col gap-4 pt-16">
        <Note>
          Groups and trips need sign-in, and this copy of Color Up doesn't have it set up.
        </Note>
        <BackToYourPlay />
      </main>
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

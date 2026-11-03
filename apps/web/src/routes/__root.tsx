import { ClerkFailed, UserButton, useAuth } from "@clerk/react";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Link, Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { FormError } from "~/components/ui/Field";
import { Menu, MenuChoice } from "~/components/ui/Menu";
import { BrandMark } from "~/components/BrandMark";
import { Landing } from "~/features/Landing";
import { LiveBar } from "~/features/LiveBar";
import { StacksProvider } from "~/lib/stacks";
import { setTheme, useTheme } from "~/lib/theme";

export const Route = createRootRoute({ component: Root });

function Root() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId} userId={userId}>
      <Frame
        tools={
          <div className="flex items-center gap-3">
            <ThemeMenu />
            <UserButton />
          </div>
        }
      >
        <a
          href="#main-content"
          className="sr-only rounded-lg bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:z-10"
        >
          Skip to content
        </a>
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-8 pt-2 pb-28">
          <Outlet />
        </main>
        <LiveBar />
      </Frame>
    </StacksProvider>
  );
}

/** The column every page sits in, under the wordmark. */
function Frame({ tools, children }: { tools?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="flex h-16 shrink-0 items-center justify-between">
        <Wordmark />
        {tools}
      </div>
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <Link
      to="/"
      className="flex min-h-11 items-center gap-2 font-display text-2xl tracking-wide uppercase"
    >
      <BrandMark className="size-7" />
      Color Up
    </Link>
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
      <Landing invited={pathname.startsWith("/join/") || pathname.startsWith("/claim/")} />
    </Frame>
  );
}

import { ClerkFailed, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Link, Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuChoice } from "~/components/ui/Menu";
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
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
        <header className="flex h-16 items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <ThemeMenu />
            <UserButton />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-8 pb-28">
          <Outlet />
        </main>
        <LiveBar />
      </div>
    </StacksProvider>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-2xl tracking-wide uppercase">
      <span aria-hidden className="size-3 rotate-45 rounded-[3px] bg-accent" />
      Stacks
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
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>
      <ClerkFailed>
        <main className="pt-16">
          <FormError>Couldn't load sign-in. Check your connection and reload the page.</FormError>
        </main>
      </ClerkFailed>
    </div>
  );
}

function SignedOut() {
  const { pathname } = useLocation();
  const invited = pathname.startsWith("/join/") || pathname.startsWith("/claim/");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex h-16 items-center justify-between">
        <Wordmark />
        <ThemeMenu />
      </header>
      <main className="flex flex-1 flex-col justify-center gap-5 pb-24">
        <h1 className="max-w-[14ch] font-display text-6xl leading-[0.9] tracking-tight uppercase sm:text-7xl">
          {invited ? "You've been invited to a group." : "Keep the casino trip honest."}
        </h1>
        <p className="max-w-[46ch] text-lg text-muted">
          {invited
            ? "Sign in or create an account to see who invited you and join their ledger."
            : "Log buy-ins and cash-outs as you play. Stacks works out everyone's results and who owes whom. You pay each other however you like."}
        </p>
        <div className="flex flex-wrap gap-3">
          <SignUpButton mode="modal">
            <Button variant="primary" size="lg">
              Create an account
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button size="lg">Sign in</Button>
          </SignInButton>
        </div>
      </main>
    </div>
  );
}

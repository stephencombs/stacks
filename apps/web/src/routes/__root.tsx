import { ClerkFailed, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Link, Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

import { Button } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuChoice } from "~/components/ui/Menu";
import { StacksProvider } from "~/lib/stacks";
import { setTheme, useTheme } from "~/lib/theme";

export const Route = createRootRoute({ component: Root });

function Root() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <SignedOut />;
  return (
    <StacksProvider key={userId}>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
        <header className="flex h-16 items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <ThemeMenu />
            <UserButton />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-8 pb-16">
          <Outlet />
        </main>
      </div>
    </StacksProvider>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="font-display text-2xl font-medium tracking-tight">
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
      <main className="flex flex-1 flex-col justify-center gap-6 pb-24">
        <h1 className="max-w-[18ch] font-display text-5xl leading-[1.05] font-medium">
          {invited ? "You've been invited to a group." : "Keep the casino trip honest."}
        </h1>
        <p className="max-w-[46ch] text-lg text-muted">
          {invited
            ? "Sign in or create an account to see who invited you and join their ledger."
            : "Log buy-ins and cash-outs as you play. Stacks works out everyone's results and who owes whom, so settling up takes one tap."}
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

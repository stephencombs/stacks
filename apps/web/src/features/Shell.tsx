import { useUser } from "@clerk/react";
import { Link, useLocation } from "@tanstack/react-router";
import { themeChoices } from "@stacks/client-runtime/theme";
import { ChartColumn, Club, MapPinned, UserRound, Users } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { BrandMark } from "~/components/BrandMark";
import { Dialog } from "~/components/ui/Dialog";
import { TabLink } from "~/components/ui/Nav";
import { Note, Section } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { useAccount } from "~/lib/account";
import { setTheme, useTheme } from "~/lib/theme";
import { AccountActions } from "./Account";
import { tabOf, type Tab } from "./tabs";
import { LiveBar } from "./LiveBar";

/**
 * The four tabs around every page in them: a bottom bar on narrow screens and a sidebar on wide
 * ones, with You behind the avatar. It reads nothing from an account or the network, so it opens
 * offline and signed out.
 */
export function AppShell({
  children,
  onClickCapture,
}: {
  children: ReactNode;
  onClickCapture?: (event: MouseEvent) => void;
}) {
  const { pathname } = useLocation();
  const current = tabOf(pathname);
  // A trip's sessions is the one page with a rail beside it, once there's room.
  const wide = /^\/trips\/[^/]+\/?$/.test(pathname);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-5 border-r border-line bg-canvas px-3 pb-3 lg:flex">
        <div className="flex h-16 shrink-0 items-center px-2">
          <Wordmark />
        </div>
        <nav aria-label="Tabs" className="flex flex-col gap-0.5">
          <Tabs current={current} layout="side" />
        </nav>
        <div className="mt-auto flex flex-col">
          <You layout="side" />
        </div>
      </aside>
      <div
        onClickCapture={onClickCapture}
        className="pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] lg:pr-10 lg:pl-70"
      >
        <div
          className={
            wide
              ? "mx-auto flex min-h-dvh w-full max-w-2xl flex-col xl:max-w-[1040px]"
              : "mx-auto flex min-h-dvh w-full max-w-2xl flex-col"
          }
        >
          <header className="box-content flex h-16 shrink-0 items-center justify-between gap-3 pt-[env(safe-area-inset-top)] lg:hidden">
            <Wordmark />
            <You layout="bar" />
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="flex w-full flex-1 flex-col gap-8 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))] outline-none has-[[data-page-actions]]:pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pt-10 lg:pb-16 lg:has-[[data-page-actions]]:pb-16"
          >
            {children}
          </main>
        </div>
      </div>
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-20 flex bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-1px_0_var(--color-line)] lg:hidden"
      >
        <Tabs current={current} layout="bar" />
      </nav>
      <LiveBar />
    </>
  );
}

export function Wordmark() {
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

const tabs = [
  { key: "play", label: "Play", icon: Club, to: "/" },
  { key: "stats", label: "Stats", icon: ChartColumn, to: "/stats" },
  { key: "map", label: "Map", icon: MapPinned, to: "/map" },
  { key: "crew", label: "Crew", icon: Users, to: "/crew" },
] as const;

function Tabs({ current, layout }: { current: Tab; layout: "bar" | "side" }) {
  return tabs.map((tab) => (
    <TabLink
      key={tab.key}
      to={tab.to}
      icon={<tab.icon className="size-5 shrink-0" aria-hidden />}
      label={tab.label}
      current={current === tab.key}
      layout={layout}
    />
  ));
}

/** Your avatar, and behind it everything that's only about you: this device, appearance, account. */
export function You({ layout }: { layout: "bar" | "side" }) {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  const theme = useTheme();
  const signedIn = account.available && account.isLoaded && account.isSignedIn === true;
  return (
    <>
      {layout === "bar" ? (
        <button
          type="button"
          aria-label="You"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="-mr-1.5 inline-grid size-11 shrink-0 place-items-center rounded-full transition-[scale] duration-150 active:scale-[0.96]"
        >
          {signedIn ? <SignedInAvatar /> : <Avatar />}
        </button>
      ) : (
        <button
          type="button"
          aria-label="You"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex h-12 shrink-0 items-center gap-3 rounded-lg px-2 text-left text-sm transition-[background-color,scale] duration-150 hover:bg-sunken active:scale-[0.96]"
        >
          {signedIn ? <SignedInAvatar /> : <Avatar />}
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">You</span>
            {signedIn ? <SignedInName /> : null}
          </span>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="You">
        <div className="flex flex-col gap-6">
          <Section title="Your sessions">
            <Note>
              Sessions you record are saved on this device first, and signing in or out leaves them
              here.
            </Note>
          </Section>
          <Section title="Appearance">
            <Segmented
              label="Appearance"
              options={themeChoices}
              value={theme}
              onChange={setTheme}
            />
          </Section>
          <Section title="Account">
            <AccountActions onClose={() => setOpen(false)} />
          </Section>
        </div>
      </Dialog>
    </>
  );
}

function Avatar({ children }: { children?: ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-fill text-sm font-semibold">
      {children ?? <UserRound className="size-4 text-muted" aria-hidden />}
    </span>
  );
}

function SignedInAvatar() {
  const { user } = useUser();
  return (
    <Avatar>
      {user?.imageUrl ? (
        <img src={user.imageUrl} alt="" className="size-full object-cover" />
      ) : user?.firstName ? (
        user.firstName.slice(0, 1)
      ) : null}
    </Avatar>
  );
}

function SignedInName() {
  const { user } = useUser();
  return user?.fullName ? (
    <span className="truncate text-xs text-muted">{user.fullName}</span>
  ) : null;
}

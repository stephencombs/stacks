import { ClerkFailed, SignInButton, SignUpButton, useClerk, useUser } from "@clerk/react";
import { useRecordingSync } from "@stacks/client-runtime/recordingReact";
import type { RecordingSyncLine } from "@stacks/client-runtime/recordingView";
import { themeChoices } from "@stacks/client-runtime/theme";
import type { VisitId } from "@stacks/contracts";
import { Link } from "@tanstack/react-router";
import {
  CircleAlert,
  CloudCheck,
  CloudOff,
  CloudUpload,
  HardDrive,
  LoaderCircle,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Note, Section } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { useAccount } from "~/lib/account";
import { setTheme, useTheme } from "~/lib/theme";
import { Wordmark } from "./Shell";

/**
 * The frame for your own play: the wordmark, a way to groups and trips, and You. It reads nothing
 * from an account or the network, so it opens offline and signed out.
 */
export function PersonalFrame({
  onClickCapture,
  children,
}: {
  onClickCapture?: (event: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to content
      </a>
      <div
        onClickCapture={onClickCapture}
        className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]"
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3">
          <Wordmark />
          <nav aria-label="Account" className="-mr-1.5 flex items-center gap-1">
            <Link
              to="/groups"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink"
            >
              <Users className="size-4" aria-hidden />
              Groups
            </Link>
            <PersonalYou />
          </nav>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex w-full flex-1 flex-col gap-8 pt-2 pb-10 outline-none"
        >
          {children}
        </main>
      </div>
    </>
  );
}

/**
 * Returns focus when a page's dialog closes: to the button that opened it, or, when that button is
 * gone (Cash out after finishing), to `fallback` or the top of the page. Wrap the page in an
 * element with `onClickCapture={capture}`; keyboard activation is a click too.
 */
export function useDialogFocus(fallback?: () => HTMLElement | null) {
  const trigger = useRef<HTMLElement | null>(null);
  const pending = useRef(false);
  // After the commit that removes the dialog. Base UI returns focus to the opening element in a
  // microtask, even when that element is gone, so this runs a task later to have the last word.
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const timer = setTimeout(() => {
      const target = trigger.current?.isConnected
        ? trigger.current
        : (fallback?.() ?? document.getElementById("main-content"));
      target?.focus();
    });
    return () => clearTimeout(timer);
  });
  return {
    capture: (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[role="dialog"]')) return;
      const button = event.target.closest<HTMLElement>("button, a");
      if (button) trigger.current = button;
    },
    restore: () => {
      pending.current = true;
    },
  };
}

/** After moving to another page, start reading it from the top. */
export const focusMain = () => document.getElementById("main-content")?.focus();

/**
 * A page's main actions, pinned within thumb reach on a phone above the home indicator, and in the
 * page's flow on a wide screen. A spacer of the bar's height keeps the last row clear of it.
 */
export function Dock({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-24 shrink-0 sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-canvas pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex w-full max-w-2xl gap-2 pt-3 sm:pt-0 [&>*]:flex-1 sm:[&>*]:flex-none">
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Whether what's on screen is saved, in words. Only a finished write to this device's storage
 * reads as saved, and only the account's confirmation reads as synced. Changes the account
 * refused follow, each with a way to record it again or let it go. Pass `visitId` on a session.
 */
export function SaveStatus({
  status,
  error,
  onRetry,
  visitId,
}: {
  status: "loading" | "saved" | "saving" | "save_failed" | "load_failed" | "closed";
  error: string | null;
  onRetry: () => void;
  visitId?: VisitId;
}) {
  const sync = useRecordingSync(visitId);
  if (status !== "saved" || (sync.rejected.length === 0 && sync.error === null))
    return <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} />;
  return (
    <>
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} />
      {sync.rejected.map((item) => (
        <div
          key={item.operationId}
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5"
        >
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item.sentence}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void sync.discard(item.operationId)}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void sync.recordAgain(item.operationId)}>
              Record again
            </Button>
          </div>
        </div>
      ))}
      {sync.error ? <p className="text-sm text-danger">{sync.error}</p> : null}
    </>
  );
}

const syncIcons: Record<RecordingSyncLine["kind"], ReactNode> = {
  device: <HardDrive className="size-4" aria-hidden />,
  syncing: <LoaderCircle className="size-4 animate-spin" aria-hidden />,
  waiting: <CloudUpload className="size-4" aria-hidden />,
  synced: <CloudCheck className="size-4" aria-hidden />,
  blocked: <CloudOff className="size-4" aria-hidden />,
};

function SaveLine({
  status,
  error,
  onRetry,
  sync,
}: {
  status: "loading" | "saved" | "saving" | "save_failed" | "load_failed" | "closed";
  error: string | null;
  onRetry: () => void;
  sync: RecordingSyncLine;
}) {
  if (status === "load_failed")
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5"
      >
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  const [icon, text] =
    status === "loading"
      ? [<LoaderCircle key="icon" className="size-4 animate-spin" aria-hidden />, "Opening…"]
      : status === "saving"
        ? [<LoaderCircle key="icon" className="size-4 animate-spin" aria-hidden />, "Saving…"]
        : status === "save_failed"
          ? [<CircleAlert key="icon" className="size-4" aria-hidden />, "Last change not saved"]
          : [syncIcons[sync.kind], sync.text];
  return (
    <p
      role="status"
      className={
        status === "save_failed"
          ? "flex items-center gap-1.5 text-sm text-danger"
          : "flex items-center gap-1.5 text-sm text-muted"
      }
    >
      {icon}
      {text}
    </p>
  );
}

/** You, for anyone: what's on this device, appearance, and sign-in when this build has it. */
function PersonalYou() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-[background-color,color,scale] duration-150 hover:bg-sunken hover:text-ink active:scale-[0.96]"
      >
        You
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="You">
        <div className="flex flex-col gap-6">
          <Section title="Your sessions">
            <Note>
              Sessions you record are saved on this device only. They aren't backed up or shared
              yet, and signing in or out leaves them here.
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

function AccountActions({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  if (!account.available)
    return <Note>Sign-in isn't set up in this copy of Color Up. Recording works without it.</Note>;
  if (!account.isLoaded)
    return (
      <Note>
        <ClerkFailed>Couldn't reach sign-in. </ClerkFailed>
        Recording on this device works without it.
      </Note>
    );
  if (!account.isSignedIn)
    return (
      <div className="flex flex-col gap-3">
        <Note>An account opens groups and trips with friends.</Note>
        <div className="flex flex-wrap gap-2">
          <SignInButton mode="modal">
            <Button onClick={onClose}>Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="ghost" onClick={onClose}>
              Create an account
            </Button>
          </SignUpButton>
        </div>
      </div>
    );
  return <SignedInActions onClose={onClose} />;
}

function SignedInActions({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const clerk = useClerk();
  return (
    <div className="flex flex-col gap-3">
      {user?.fullName ? <Note>Signed in as {user.fullName}.</Note> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            onClose();
            clerk.openUserProfile();
          }}
        >
          Manage account
        </Button>
        <Button onClick={() => void clerk.signOut()}>Sign out</Button>
      </div>
    </div>
  );
}

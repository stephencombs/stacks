import { ClerkFailed, SignInButton, SignUpButton, useClerk, useUser } from "@clerk/react";

import { Button } from "~/components/ui/Button";
import { Note } from "~/components/ui/Page";
import { useAccount } from "~/lib/account";

/** Sign-in, or the signed-in account's own actions, wherever sign-in applies. */
export function AccountActions({ onClose }: { onClose: () => void }) {
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

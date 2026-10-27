import { useClerk } from "@clerk/expo";

import { Button } from "../components/ui/Button";

/** The web build signs in with Clerk's own modal, like apps/web. */
export function SignInButton({
  mode,
  label,
  variant,
}: {
  mode: "sign-in" | "sign-up";
  label: string;
  variant: "primary" | "secondary";
}) {
  const clerk = useClerk();
  return (
    <Button
      label={label}
      variant={variant}
      size="lg"
      onPress={() => (mode === "sign-up" ? clerk.openSignUp() : clerk.openSignIn())}
    />
  );
}

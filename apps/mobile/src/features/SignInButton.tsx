import { useHostedAuth } from "@clerk/expo/hosted-auth";

import { Button } from "../components/ui/Button";

/** Opens Clerk's sign-in pages in a system browser sheet and returns with a session. */
export function SignInButton({
  mode,
  label,
  variant,
}: {
  mode: "sign-in" | "sign-up";
  label: string;
  variant: "primary" | "secondary";
}) {
  const { startHostedAuth } = useHostedAuth();
  return (
    <Button
      label={label}
      variant={variant}
      size="lg"
      onPress={() => void startHostedAuth({ mode })}
    />
  );
}

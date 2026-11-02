import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";

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
  const [problem, setProblem] = useState<string | null>(null);
  const start = async () => {
    setProblem(null);
    try {
      await startHostedAuth({ mode });
    } catch (error) {
      // Clerk's errors say what went wrong in its own words; show them rather than nothing.
      setProblem(error instanceof Error ? error.message : "Signing in didn't finish. Try again.");
    }
  };
  return (
    <View className="gap-2">
      <Button label={label} variant={variant} size="lg" onPress={() => void start()} />
      {problem ? <FormError>{problem}</FormError> : null}
    </View>
  );
}

import { isClerkAPIResponseError } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useUniwind } from "uniwind";

import { FormError } from "../components/ui/Field";
import { useAccount } from "../lib/account";

const WAITLIST_CODES = new Set(["sign_up_restricted_waitlist", "sign_up_mode_restricted"]);

const WAITLIST_MESSAGE =
  "Color Up is invite-only for now. Join the waitlist with Create an account.";

const MISSING_MESSAGE =
  "Apple didn't share enough to finish your account. Try Create an account instead.";

let supported: Promise<boolean> | undefined;

const checkSupported = () =>
  (supported ??= AppleAuthentication.isAvailableAsync().catch(() => false));

/**
 * Whether the native Apple button shows: on iOS, in a build with Clerk, once Clerk has loaded, on
 * a device that offers Sign in with Apple. Landing reads it to keep a single primary action.
 */
export function useAppleSignInAvailable() {
  const account = useAccount();
  const ready = Platform.OS === "ios" && account.available && account.isLoaded;
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let current = true;
    void checkSupported().then((value) => {
      if (current) setOffered(value);
    });

    return () => {
      current = false;
    };
  }, [ready]);

  return ready && offered;
}

function AppleFlow() {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { theme } = useUniwind();
  const running = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setProblem(null);

    try {
      const { createdSessionId, setActive, signUp } = await startAppleAuthenticationFlow();

      if (createdSessionId) await setActive?.({ session: createdSessionId });
      else if (signUp?.status === "missing_requirements") setProblem(MISSING_MESSAGE);
    } catch (error) {
      setProblem(
        isClerkAPIResponseError(error) &&
          error.errors.some((entry) => WAITLIST_CODES.has(entry.code))
          ? WAITLIST_MESSAGE
          : error instanceof Error
            ? error.message
            : "Signing in didn't finish. Try again.",
      );
    } finally {
      running.current = false;
    }
  };

  return (
    <View className="gap-2">
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          theme === "dark"
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={26}
        style={{ width: "100%", height: 52 }}
        onPress={() => void start()}
      />
      {problem ? <FormError>{problem}</FormError> : null}
    </View>
  );
}

/** The native Sign in with Apple button. It renders nothing wherever Apple sign-in isn't offered. */
export function AppleSignInButton() {
  return useAppleSignInAvailable() ? <AppleFlow /> : null;
}

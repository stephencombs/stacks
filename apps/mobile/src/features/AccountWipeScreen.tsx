import { reloadAppAsync } from "expo";
import { useEffect } from "react";
import { Platform, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Text } from "../components/ui/Text";
import { useAccount } from "../lib/account";
import { continueAccountWipe, finishAccountWipe, type AccountWipe } from "../lib/accountDeletion";

const status = {
  complete: "Your account and the data on this phone are gone.",
  pending:
    "Your account and the data on this phone are gone. Your sign-in record will finish deleting shortly.",
  unknown: "This account was deleted, so Color Up cleared its data from this phone.",
};

const appleSteps =
  Platform.OS === "ios"
    ? "To remove Color Up from your Apple Account too, open Settings, tap your name, then Sign in with Apple. Choose Color Up and tap Stop Using Apple Account."
    : "To remove Color Up from your Apple Account too, sign in at account.apple.com, open Sign-In and Security, then Sign in with Apple. Choose Color Up and stop using it.";

/**
 * Takes the whole app's place while a deleted account's data comes off the phone, so nothing
 * syncs or listens meanwhile. It starts the wipe, signs out once the files are gone, and ends on a
 * button that restarts the app signed out, on Play.
 */
export function AccountWipeScreen({ wipe: { wipe, stage } }: { wipe: AccountWipe }) {
  const account = useAccount();
  const signedOutReady = !account.available || account.isLoaded;

  useEffect(() => {
    if (stage === "waiting") void continueAccountWipe();
  }, [stage]);

  useEffect(() => {
    if (stage === "signing_out" && signedOutReady) void finishAccountWipe();
  }, [stage, signedOutReady]);

  if (stage === "done") {
    return (
      <View className="flex-1 justify-center gap-4 bg-canvas px-6">
        <Text accessibilityRole="header" className="type-headline text-ink">
          Account deleted
        </Text>
        <Text className="text-lg text-muted">{status[wipe.status]}</Text>
        {wipe.appleManual ? <Text className="text-lg text-muted">{appleSteps}</Text> : null}
        <Button label="Done" variant="primary" size="lg" onPress={() => void reloadAppAsync()} />
      </View>
    );
  }

  if (stage === "failed") {
    return (
      <View className="flex-1 justify-center gap-4 bg-canvas px-6">
        <Text accessibilityRole="header" className="type-headline text-ink">
          Couldn't finish clearing this phone
        </Text>
        <Text className="text-lg text-muted">
          Your account is deleted, but some of its data is still here. Try again.
        </Text>
        <Button
          label="Try again"
          variant="primary"
          size="lg"
          onPress={() => void continueAccountWipe()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <Text accessibilityLiveRegion="polite" className="text-center text-lg text-ink">
        Clearing your data from this phone…
      </Text>
    </View>
  );
}

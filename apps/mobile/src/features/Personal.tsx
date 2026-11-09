import { useClerk, useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import { useRecordingSync } from "@stacks/client-runtime/recordingReact";
import type { RecordingSyncLine } from "@stacks/client-runtime/recordingView";
import { themeChoices } from "@stacks/client-runtime/theme";
import type { VisitId } from "@stacks/contracts";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui/Button";
import { Choice } from "../components/ui/Field";
import { Icon, type IconName } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { SectionHeading } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useAccount } from "../lib/account";
import { setTheme, useTheme } from "../lib/theme";
import { SignInButton } from "./SignInButton";

/**
 * A screen of your own play: it scrolls under the header, and its main actions sit in a dock
 * within thumb reach above the home indicator, stacked unless the caller puts them in a row. It reads nothing from an account or the network,
 * so it has no live bar.
 */
export function PersonalScreen({ children, dock }: { children: ReactNode; dock?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const sides = {
    paddingLeft: Math.max(16, insets.left),
    paddingRight: Math.max(16, insets.right),
  };
  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 pt-4 pb-8"
        contentContainerStyle={sides}
      >
        {children}
      </ScrollView>
      {dock ? (
        <View
          className="gap-2 border-t border-line bg-canvas pt-3"
          style={{ ...sides, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          {dock}
        </View>
      ) : null}
    </View>
  );
}

type Status = "loading" | "saved" | "saving" | "save_failed" | "load_failed" | "closed";

/**
 * Whether what's on screen is saved, in words. Only a finished write to this device reads as
 * saved, and only the account's confirmation reads as synced. Changes the account refused
 * follow, each with a way to record it again or let it go. Pass `visitId` on a session.
 */
export function SaveStatus({
  status,
  error,
  onRetry,
  visitId,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  visitId?: VisitId;
}) {
  const sync = useRecordingSync(visitId);
  if (status !== "saved" || (sync.rejected.length === 0 && sync.error === null))
    return <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} />;
  return (
    <View className="gap-2">
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} />
      {sync.rejected.map((item) => (
        <View
          key={item.operationId}
          accessibilityRole="alert"
          className="gap-3 rounded-lg bg-sunken px-3 py-2.5"
        >
          <View className="min-w-0 flex-row gap-2">
            <Icon name="alert" color="danger" size={16} />
            <Text selectable className="flex-1 text-sm text-danger">
              {item.sentence}
            </Text>
          </View>
          <View className="flex-row justify-end gap-2">
            <Button label="Discard" size="sm" onPress={() => void sync.discard(item.operationId)} />
            <Button
              label="Record again"
              size="sm"
              onPress={() => void sync.recordAgain(item.operationId)}
            />
          </View>
        </View>
      ))}
      {sync.error ? <Text className="text-sm text-danger">{sync.error}</Text> : null}
    </View>
  );
}

const syncIcons: Record<RecordingSyncLine["kind"], IconName> = {
  device: "check",
  syncing: "cloud-upload",
  waiting: "cloud-upload",
  synced: "cloud-check",
  blocked: "cloud-off",
};

function SaveLine({
  status,
  error,
  onRetry,
  sync,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  sync: RecordingSyncLine;
}) {
  if (status === "load_failed")
    return (
      <View
        accessibilityRole="alert"
        className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5"
      >
        <View className="min-w-0 flex-1 flex-row gap-2">
          <Icon name="alert" color="danger" size={16} />
          <Text selectable className="flex-1 text-sm text-danger">
            {error}
          </Text>
        </View>
        <Button label="Try again" size="sm" onPress={onRetry} />
      </View>
    );
  const busy = status === "loading" || status === "saving" || sync.kind === "syncing";
  const failed = status === "save_failed";
  const text =
    status === "loading"
      ? "Opening…"
      : status === "saving"
        ? "Saving…"
        : failed
          ? "Last change not saved"
          : sync.text;
  return (
    <View accessibilityLiveRegion="polite" className="min-h-5 flex-row items-center gap-1.5">
      {busy ? (
        <ActivityIndicator size="small" colorClassName="accent-muted" />
      ) : (
        <Icon
          name={failed ? "alert" : syncIcons[sync.kind]}
          color={failed ? "danger" : "muted"}
          size={14}
        />
      )}
      <Text className={cn("text-sm", failed ? "text-danger" : "text-muted")}>{text}</Text>
    </View>
  );
}

/** The personal header's right side: a way to groups and trips, and You for anyone. */
export function PersonalNav() {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-row items-center">
      <Button
        label="Groups"
        variant="ghost"
        size="sm"
        onPress={() => navigation.navigate("Account", { screen: "Groups" })}
      />
      <Button label="You" variant="ghost" size="sm" onPress={() => setOpen(true)} />
      {open ? <PersonalYou onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

function PersonalYou({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  return (
    <Sheet open onClose={onClose} title="You">
      <View className="gap-2">
        <SectionHeading>Your sessions</SectionHeading>
        <Text className="text-base text-muted">
          Sessions you record are saved on this device only. They aren't backed up or shared yet,
          and signing in or out leaves them here.
        </Text>
      </View>
      <Choice label="Appearance" options={themeChoices} value={theme} onChange={setTheme} />
      <View className="gap-2">
        <SectionHeading>Account</SectionHeading>
        <AccountActions />
      </View>
    </Sheet>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <Text className="text-base text-muted">{children}</Text>;
}

function AccountActions() {
  const account = useAccount();
  if (!account.available)
    return <Note>Sign-in isn't set up in this copy of Color Up. Recording works without it.</Note>;
  if (!account.isLoaded)
    return <Note>Sign-in hasn't loaded yet. Recording on this device works without it.</Note>;
  if (!account.isSignedIn)
    return (
      <View className="gap-3">
        <Note>An account opens groups and trips with friends.</Note>
        <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
        <SignInButton mode="sign-up" label="Create an account" variant="secondary" />
      </View>
    );
  return <SignedIn />;
}

function SignedIn() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <View className="gap-3">
      {user?.fullName || email ? <Note>Signed in as {user?.fullName ?? email}.</Note> : null}
      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </View>
  );
}

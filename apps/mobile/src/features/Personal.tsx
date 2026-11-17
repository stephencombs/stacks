import { useClerk, useUser } from "@clerk/expo";
import { useRecordingSync } from "@stacks/client-runtime/recordingReact";
import type { RecordingSyncLine } from "@stacks/client-runtime/recordingView";
import { themeChoices } from "@stacks/client-runtime/theme";
import type { VisitId } from "@stacks/contracts";
import { use, useState, type ReactNode, type Ref } from "react";
import { ActivityIndicator, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/Button";
import { ControlSurface } from "../components/ui/ControlSurface";
import { PressableScale } from "../components/ui/PressableScale";
import { Choice } from "../components/ui/Field";
import { Icon, type IconName } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { TabBarHeight } from "../components/ui/Screen";
import { SectionHeading } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useAccount } from "../lib/account";
import { setTheme, useTheme } from "../lib/theme";
import { Chip } from "./Chip";
import { SignInButton } from "./SignInButton";
import { PersonalLiveBar } from "./LiveBar";
import { useNativeHeaderActions } from "./NativeHeaderActions";

/** The 56px floating action button and the 16px around it, which the list scrolls clear of. */
const FAB_ROOM = 88;

/**
 * A screen of your own play: it scrolls under the header, and its main actions sit in a dock
 * within thumb reach above the tab bar or the home indicator, stacked unless the caller puts them
 * in a row. It reads nothing from an account or the network. With `live`, your own live session
 * floats above the tab bar.
 */
export function PersonalScreen({
  children,
  dock,
  fab,
  live = false,
  felt = false,
  session = false,
  scrollRef,
}: {
  children: ReactNode;
  dock?: ReactNode;
  /** A floating action button, bottom right above the live bar: the screen's main way to add. */
  fab?: ReactNode;
  live?: boolean;
  felt?: boolean;
  session?: boolean;
  scrollRef?: Ref<ScrollViewInstance>;
}) {
  const header = useNativeHeaderActions(true);
  const bar = use(TabBarHeight);
  const [dockHeight, setDockHeight] = useState(0);
  const [liveBarHeight, setLiveBarHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const sides = {
    paddingLeft: Math.max(16, insets.left),
    paddingRight: Math.max(16, insets.right),
  };
  return (
    <View className={felt ? "flex-1 bg-felt" : "flex-1 bg-canvas"}>
      {header}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 pt-4 pb-8"
        contentContainerStyle={{
          ...sides,
          flexGrow: 1,
          ...(session ? { paddingTop: insets.top + 12 } : {}),
        }}
      >
        {children}
        <View
          style={{ height: (dock ? dockHeight : bar) + liveBarHeight + (fab ? FAB_ROOM : 0) }}
        />
      </ScrollView>
      {fab ? (
        <View
          pointerEvents="box-none"
          className="absolute"
          style={{
            right: sides.paddingRight,
            bottom: bar + (liveBarHeight > 0 ? liveBarHeight + 8 : 0) + 16,
          }}
        >
          {fab}
        </View>
      ) : null}
      {dock ? (
        <View
          pointerEvents="box-none"
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          className={cn("absolute inset-x-0 bottom-0 gap-2 pt-3", felt && "bg-felt")}
          style={{ ...sides, paddingBottom: bar || Math.max(insets.bottom, 12) }}
        >
          {dock}
        </View>
      ) : null}
      {live ? (
        <PersonalLiveBar
          onHeightChange={setLiveBarHeight}
          {...(dock ? { bottom: dockHeight } : bar ? { bottom: bar } : {})}
        />
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
  felt = false,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  visitId?: VisitId;
  felt?: boolean;
}) {
  const sync = useRecordingSync(visitId);
  if (
    status !== "saved" ||
    (sync.rejected.length === 0 && sync.error === null && sync.claim.length === 0 && !sync.canLink)
  )
    return (
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} felt={felt} />
    );
  return (
    <View className="gap-2">
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} felt={felt} />
      {sync.canLink ? (
        <View className="gap-3 rounded-lg bg-fill px-3 py-2.5">
          <Text className="text-sm text-muted">
            Link them to your account to keep them there. They stay separate players, and nothing is
            merged.
          </Text>
          <View className="flex-row justify-end">
            <Button label="Link to my account" size="sm" onPress={sync.link} />
          </View>
        </View>
      ) : null}
      {sync.claim.map((line) => (
        <View
          key={line.kind}
          accessibilityRole={line.kind === "refused" ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          className="gap-3 rounded-lg bg-fill px-3 py-2.5"
        >
          <View className="min-w-0 flex-row gap-2">
            <Icon
              name={line.kind === "refused" ? "alert" : "cloud-check"}
              color={line.kind === "refused" ? "loss" : "muted"}
              size={16}
            />
            <Text
              selectable
              className={cn("flex-1 text-sm", line.kind === "refused" ? "text-loss" : "text-muted")}
            >
              {line.text}
            </Text>
          </View>
          <View className="flex-row justify-end">
            <Button label="Dismiss" size="sm" onPress={sync.dismissClaim} />
          </View>
        </View>
      ))}
      {sync.rejected.map((item) => (
        <View
          key={item.operationId}
          accessibilityRole="alert"
          className="gap-3 rounded-lg bg-fill px-3 py-2.5"
        >
          <View className="min-w-0 flex-row gap-2">
            <Icon name="alert" color="loss" size={16} />
            <Text selectable className="flex-1 text-sm text-loss">
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
      {sync.error ? <Text className="text-sm text-loss">{sync.error}</Text> : null}
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
  felt = false,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  sync: RecordingSyncLine;
  felt?: boolean;
}) {
  if (status === "load_failed")
    return (
      <View
        accessibilityRole="alert"
        className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg bg-fill px-3 py-2.5"
      >
        <View className="min-w-0 flex-1 flex-row gap-2">
          <Icon name="alert" color="loss" size={16} />
          <Text selectable className="flex-1 text-sm text-loss">
            {error}
          </Text>
        </View>
        <Button label="Try again" size="sm" onPress={onRetry} />
      </View>
    );
  const busy = status === "loading" || status === "saving" || sync.kind === "syncing";
  const failed = status === "save_failed";
  // Saved and in step needs no line; the You sheet says where your sessions are kept.
  if (!busy && !failed && (sync.kind === "device" || sync.kind === "synced")) return null;
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
        <ActivityIndicator
          size="small"
          colorClassName={felt ? "accent-felt-soft" : "accent-muted"}
        />
      ) : (
        <Icon
          name={failed ? "alert" : syncIcons[sync.kind]}
          color={failed ? "loss" : felt ? "felt-soft" : "muted"}
          size={14}
        />
      )}
      <Text
        className={cn("text-sm", failed ? "text-loss" : felt ? "text-felt-soft" : "text-muted")}
      >
        {text}
      </Text>
    </View>
  );
}

/** You, top right of your own play's screens, for anyone signed in or not. */
export function PersonalYouButton() {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="You"
        accessibilityHint="Your sessions, appearance and account"
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="size-11"
      >
        <ControlSurface>
          {account.available && account.isSignedIn ? (
            <SignedInChip />
          ) : (
            <Icon name="person" color="ink" size={20} />
          )}
        </ControlSurface>
      </PressableScale>
      {open ? <PersonalYou onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Your chip, once signed in. Only rendered under Clerk, which useUser needs. */
function SignedInChip() {
  const { user } = useUser();
  return <Chip chip={1} name={user?.firstName ?? user?.fullName ?? "You"} size={32} />;
}

/** Color Up's mark and name, top left of Play. */
export function PlayBrand() {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Color Up"
      className="flex-row items-center gap-2.5"
    >
      <BrandMark size={30} />
      <Text className="type-title text-ink">Color Up</Text>
    </View>
  );
}

export function PersonalYou({ onClose }: { onClose: () => void }) {
  const sync = useRecordingSync();
  const theme = useTheme();
  return (
    <Sheet open onClose={onClose} title="You">
      <View className="gap-2">
        <SectionHeading>Your sessions</SectionHeading>
        <Text accessibilityLiveRegion="polite" className="text-base text-ink">
          {sync.line.text}
        </Text>
        <Text className="text-base text-muted">
          Sessions save on this device first. Sign in to sync them to your account. Signing in or
          out leaves them on this device.
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

import { useClerk, useUser } from "@clerk/expo";
import { describeError } from "@stacks/client-runtime/errors";
import { exportPersonalSessionsCsv, personalCsvFilename } from "@stacks/client-runtime/export";
import { gameNames } from "@stacks/client-runtime/format";
import { useRecordingHome, useRecordingSync } from "@stacks/client-runtime/recordingReact";
import { themeChoices } from "@stacks/client-runtime/theme";
import { Game } from "@stacks/contracts";
import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Button } from "../components/ui/Button";
import { ControlSurface } from "../components/ui/ControlSurface";
import { Choice, FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet, SheetHost } from "../components/ui/Sheet";
import { Card, SettingsGroup, SettingsRow } from "../components/ui/Surface";
import { Switch } from "../components/ui/Switch";
import { useAccount } from "../lib/account";
import {
  setDefaultGame,
  setDefaultVenue,
  setPrivacyMode,
  setShowCents,
  usePreferences,
} from "../lib/preferences";
import { shareCsv } from "../lib/share";
import { setTheme, useTheme } from "../lib/theme";
import { Chip } from "./Chip";
import { SignInButton } from "./SignInButton";
import { CasinoPickerSheet } from "./VenuePicker";

type DefaultGameChoice = Game | "none";

const defaultGameOptions: ReadonlyArray<{ value: DefaultGameChoice; label: string }> = [
  { value: "none", label: "Not set" },
  ...Game.literals.map((game) => ({ value: game, label: gameNames[game] })),
];

/**
 * Your chip, top right of every screen: everything that's only about you opens from it. It's one
 * colour everywhere, like Play's, not the colour a group knows you by, which would change with the
 * group in scope and while its people load.
 */
export function YouButton() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const name = user?.firstName ?? user?.fullName ?? "You";

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="You"
        accessibilityHint="Your settings and account"
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="size-11 items-center justify-center"
      >
        {Platform.OS === "android" ? (
          <Chip chip={5} name={user?.fullName ?? name} size={32} ring />
        ) : (
          <ControlSurface>
            <Chip chip={1} name={name} size={32} />
          </ControlSurface>
        )}
      </PressableScale>
      {open ? <YouSheet name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * The shared You settings sheet opened from Play, Stats, Map, and Crew. Safe both signed in and
 * signed out by guarding Clerk hooks behind `AccountProvider`.
 */
export function YouSheet({ name = "You", onClose }: { name?: string; onClose: () => void }) {
  return (
    <SheetHost>
      <YouSettings name={name} onClose={onClose} />
    </SheetHost>
  );
}

function YouSettings({ name, onClose }: { name: string; onClose: () => void }) {
  const account = useAccount();
  const sync = useRecordingSync();
  const { home, status, error, retryLoad } = useRecordingHome();
  const theme = useTheme();
  const prefs = usePreferences();
  const [picking, setPicking] = useState<"game" | "venue" | null>(null);

  const [exportState, setExportState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });

  const signedIn = account.available && account.isLoaded && !!account.isSignedIn;
  const ios = Platform.OS === "ios";
  const finished = home?.finished ?? [];

  const exportSessions = async () => {
    if (exportState.pending || finished.length === 0) return;
    setExportState({ pending: true, error: null });

    try {
      const csv = exportPersonalSessionsCsv(finished);
      await shareCsv(personalCsvFilename(), csv);
      setExportState({ pending: false, error: null });
    } catch (error) {
      setExportState({ pending: false, error: describeError(error) });
    }
  };

  if (picking === "venue")
    return (
      <CasinoPickerSheet
        context="default"
        selectedId={prefs.defaultVenue?.id ?? null}
        selected={prefs.defaultVenue}
        onSelect={setDefaultVenue}
        onClose={() => setPicking(null)}
      />
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title="You"
      footer={signedIn && !ios ? <SignOutButton /> : undefined}
    >
      {signedIn && !ios ? <SignedInCard fallbackName={name} /> : null}

      <View className={ios ? "gap-4" : "gap-5"}>
        <View className="gap-2">
          <Text className="px-1 type-footnote font-medium text-muted">Your sessions</Text>
          <Card className="gap-1 p-4">
            <Text accessibilityLiveRegion="polite" className="type-body text-ink">
              {status === "load_failed" ? error : sync.line.text}
            </Text>
            {status === "load_failed" ? (
              <Button label="Try again" variant="secondary" onPress={retryLoad} />
            ) : (
              <Text className="type-footnote text-muted">
                {signedIn
                  ? "Sessions save on this device first, then sync to your account."
                  : "Sessions save on this device first. Sign in to sync them to your account."}
              </Text>
            )}
          </Card>
        </View>

        <SettingsGroup title="Recording defaults">
          <SettingsRow
            compact={ios}
            icon={<Icon name="sessions" color="ink" size={16} />}
            title="Default game"
            value={
              Platform.OS === "ios"
                ? undefined
                : prefs.defaultGame
                  ? gameNames[prefs.defaultGame]
                  : "Not set"
            }
            trailing={
              Platform.OS === "ios" ? (
                <Choice
                  inline
                  label="Default game"
                  labelHidden
                  options={defaultGameOptions}
                  value={prefs.defaultGame ?? "none"}
                  onChange={(next) => setDefaultGame(next === "none" ? null : next)}
                />
              ) : undefined
            }
            onPress={
              Platform.OS === "ios"
                ? undefined
                : () => setPicking((current) => (current === "game" ? null : "game"))
            }
            accessibilityHint={
              Platform.OS === "ios" ? undefined : "Changes the default game for new sessions"
            }
          />
          <SettingsRow
            compact={ios}
            icon={<Icon name="map" color="ink" size={16} />}
            title="Default casino"
            value={prefs.defaultVenue?.name ?? "Not set"}
            onPress={() => setPicking("venue")}
            accessibilityHint="Changes the default casino for new sessions"
          />
        </SettingsGroup>

        {picking === "game" ? (
          <Choice
            label="Default game"
            labelHidden
            options={defaultGameOptions}
            value={prefs.defaultGame ?? "none"}
            onChange={(next) => {
              setDefaultGame(next === "none" ? null : next);
              setPicking(null);
            }}
          />
        ) : null}

        <SettingsGroup title="Display">
          <SettingsRow
            compact={ios}
            icon={<Icon name="filter" color="ink" size={16} />}
            title="Show cents"
            subtitle="Show .00 on whole amounts"
            trailing={
              <Switch
                accessibilityLabel="Show cents"
                value={prefs.showCents}
                onValueChange={setShowCents}
              />
            }
          />
          <SettingsRow
            compact={ios}
            icon={<Icon name="eye-off" color="ink" size={16} />}
            title="Privacy mode"
            subtitle="Hide amounts across the app"
            trailing={
              <Switch
                accessibilityLabel="Privacy mode"
                value={prefs.privacyMode}
                onValueChange={setPrivacyMode}
              />
            }
          />
        </SettingsGroup>

        <Choice label="Appearance" options={themeChoices} value={theme} onChange={setTheme} />

        <SettingsGroup title="Export">
          <SettingsRow
            compact={ios}
            icon={<Icon name="download" color="ink" size={16} />}
            title={exportState.pending ? "Exporting…" : "Export sessions (CSV)"}
            subtitle={
              finished.length === 0
                ? "Finish a session to export it"
                : `${finished.length} finished ${finished.length === 1 ? "session" : "sessions"}`
            }
            onPress={
              finished.length > 0 && !exportState.pending ? () => void exportSessions() : undefined
            }
            accessibilityHint="Exports all recorded sessions as a CSV file"
          />
        </SettingsGroup>
        {exportState.error ? <FormError>{exportState.error}</FormError> : null}
        <Text className="-mt-3 px-1 type-footnote text-muted">
          All of your session history can always be exported as a file.
        </Text>

        {signedIn && ios ? (
          <SettingsGroup title="Account">
            <SignedInCard fallbackName={name} />
            <View className="border-t border-line p-2">
              <SignOutButton />
            </View>
          </SettingsGroup>
        ) : !signedIn ? (
          <SettingsGroup title="Account">
            <View className="p-4">
              <AccountActions />
            </View>
          </SettingsGroup>
        ) : null}
      </View>
    </Sheet>
  );
}

function SignedInCard({ fallbackName }: { fallbackName: string }) {
  const { user } = useUser();
  const displayName = user?.fullName ?? fallbackName;
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Chip chip={Platform.OS === "android" ? 5 : 1} name={displayName} size={46} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-lg font-semibold text-ink">
          {displayName}
        </Text>
        {email ? (
          <Text numberOfLines={1} className="text-sm text-muted">
            {email}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function SignOutButton() {
  const { signOut } = useClerk();

  return <Button label="Sign out" variant="danger" onPress={() => void signOut()} />;
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

  return (
    <View className="gap-3">
      <Note>An account opens groups and trips with friends.</Note>
      <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
      <SignInButton mode="sign-up" label="Create an account" variant="secondary" />
    </View>
  );
}

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
import { Card, Row, SettingsGroup, SettingsRow } from "../components/ui/Surface";
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
import { AppleSignInButton } from "./AppleSignInButton";
import { SignInButton } from "./SignInButton";
import { UserAvatar } from "./UserAvatar";
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
          <UserAvatar size={32} fallbackName={name} />
        ) : (
          <ControlSurface>
            <UserAvatar size={32} fallbackName={name} ring={false} />
          </ControlSurface>
        )}
      </PressableScale>
      <YouSheet open={open} name={name} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * The shared You settings sheet opened from Play, Stats, Map, and Crew. Safe both signed in and
 * signed out by guarding Clerk hooks behind `AccountProvider`.
 */
export function YouSheet({
  open,
  name = "You",
  onClose,
}: {
  open: boolean;
  name?: string;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState(open);

  if (open && !opened) setOpened(true);

  // WARNING: unmounting the host tears the native sheet down mid-dismiss, so it stays once opened.
  if (!opened) return null;

  return (
    <SheetHost>
      <YouSettings open={open} name={name} onClose={onClose} />
    </SheetHost>
  );
}

function YouSettings({
  open,
  name,
  onClose,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
}) {
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

  if (open && picking === "venue")
    return (
      <CasinoPickerSheet
        context="default"
        selectedId={prefs.defaultVenue?.id ?? null}
        selected={prefs.defaultVenue}
        onSelect={(venue) => {
          setDefaultVenue(venue);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="You"
      large={ios}
      footer={signedIn && !ios ? <SignOutButton /> : undefined}
    >
      {signedIn && !ios ? (
        <Card className="flex-row items-center gap-3 p-4">
          <Profile fallbackName={name} />
        </Card>
      ) : null}

      <View className="gap-5">
        <SettingsGroup title="Your sessions">
          <Row className="py-3">
            <View className="min-w-0 flex-1 gap-1">
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
            </View>
          </Row>
        </SettingsGroup>

        <SettingsGroup title="Recording defaults">
          <SettingsRow
            icon={<Icon name="sessions" color="ink" size={16} />}
            title="Default game"
            value={ios ? undefined : prefs.defaultGame ? gameNames[prefs.defaultGame] : "Not set"}
            trailing={
              ios ? (
                <View className="-my-3">
                  <Choice
                    inline
                    label="Default game"
                    labelHidden
                    options={defaultGameOptions}
                    value={prefs.defaultGame ?? "none"}
                    onChange={(next) => setDefaultGame(next === "none" ? null : next)}
                  />
                </View>
              ) : undefined
            }
            onPress={
              ios ? undefined : () => setPicking((current) => (current === "game" ? null : "game"))
            }
            accessibilityHint={ios ? undefined : "Changes the default game for new sessions"}
          />
          <SettingsRow
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

        <SettingsGroup title="Appearance">
          <Row className="py-2">
            <View className="flex-1">
              <Choice
                label="Appearance"
                labelHidden
                options={themeChoices}
                value={theme}
                onChange={setTheme}
              />
            </View>
          </Row>
        </SettingsGroup>

        <SettingsGroup
          title="Export"
          footer={
            <>
              {exportState.error ? <FormError>{exportState.error}</FormError> : null}
              <Text className="px-1 type-footnote text-muted">
                All of your session history can always be exported as a file.
              </Text>
            </>
          }
        >
          <SettingsRow
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

        {signedIn && ios ? (
          <>
            <SettingsGroup title="Account">
              <Row className="py-3">
                <Profile fallbackName={name} />
              </Row>
            </SettingsGroup>
            <SettingsGroup>
              <SignOutRow />
            </SettingsGroup>
          </>
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

function Profile({ fallbackName }: { fallbackName: string }) {
  const { user } = useUser();
  const displayName = user?.fullName ?? fallbackName;
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <>
      <UserAvatar size={46} fallbackName={displayName} ring={false} />
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
    </>
  );
}

function SignOutRow() {
  const { signOut } = useClerk();

  return (
    <Row className="min-h-12 py-3" onPress={() => void signOut()}>
      <Text className="type-body font-medium text-loss">Sign out</Text>
    </Row>
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
      <AppleSignInButton />
      <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
      <SignInButton mode="sign-up" label="Create an account" variant="secondary" />
    </View>
  );
}

import { useClerk, useUser } from "@clerk/expo";
import { themeChoices } from "@stacks/client-runtime/theme";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice } from "../components/ui/Field";
import { ControlSurface } from "../components/ui/ControlSurface";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet } from "../components/ui/Sheet";
import { Card } from "../components/ui/Surface";
import { setTheme, useTheme } from "../lib/theme";
import { Chip } from "./Chip";

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
        accessibilityHint="Your appearance and account"
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

export function YouSheet({ name = "You", onClose }: { name?: string; onClose: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const theme = useTheme();
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <Sheet
      open
      onClose={onClose}
      title="You"
      footer={<Button label="Sign out" variant="danger" onPress={() => void signOut()} />}
    >
      <Card className="flex-row items-center gap-3 p-4">
        <Chip chip={1} name={name} size={46} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-lg font-semibold text-ink">
            {user?.fullName ?? name}
          </Text>
          {email ? (
            <Text numberOfLines={1} className="text-sm text-muted">
              {email}
            </Text>
          ) : null}
        </View>
      </Card>
      <Choice label="Appearance" options={themeChoices} value={theme} onChange={setTheme} />
    </Sheet>
  );
}

import { useState } from "react";

import { ControlSurface } from "../components/ui/ControlSurface";
import { Icon } from "../components/ui/Icon";
import { PressableScale } from "../components/ui/PressableScale";
import { Toolbar } from "../components/ui/Toolbar";
import { useAccount } from "../lib/account";
import { isLiquidGlassSupported } from "../lib/liquidGlass";
import type { NativeHeaderActionsOptions } from "./NativeHeaderActions";
import { UserAvatar } from "./UserAvatar";
import { YouSheet } from "./You";

/**
 * You, top right of every iOS screen with a navigation bar, plus Groups beside it on Crew. The
 * element it returns goes in the screen so the You sheet opens from there.
 */
export function useNativeHeaderActions({
  onOpenGroups,
  disabled = false,
}: NativeHeaderActionsOptions = {}) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const signedIn = account.available && !!account.isSignedIn;
  const openYou = () => setOpen(true);

  if (disabled) return null;

  return (
    <>
      <Toolbar placement="right">
        {onOpenGroups ? (
          <Toolbar.Button
            label="Groups"
            separateBackground
            identifier="crew-groups"
            onPress={onOpenGroups}
          />
        ) : null}
        {isLiquidGlassSupported && !signedIn ? (
          <Toolbar.Button
            icon="person"
            accessibilityLabel="You"
            identifier="you-account"
            onPress={openYou}
          />
        ) : (
          <Toolbar.Custom hidesSharedBackground>
            <YouAvatar signedIn={signedIn} onPress={openYou} />
          </Toolbar.Custom>
        )}
      </Toolbar>
      {open ? <YouSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function YouAvatar({ signedIn, onPress }: { signedIn: boolean; onPress: () => void }) {
  const face = signedIn ? (
    <UserAvatar size={32} ring={false} />
  ) : (
    <Icon name="person" color="ink" size={20} />
  );

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="You"
      accessibilityHint="Your sessions, appearance and account"
      onPress={onPress}
      hitSlop={6}
      className="size-11 items-center justify-center"
    >
      <ControlSurface>{face}</ControlSurface>
    </PressableScale>
  );
}

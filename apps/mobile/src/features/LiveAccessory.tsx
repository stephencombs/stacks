import { useNavigation, type ParamListBase } from "@react-navigation/native";
import type { NativeBottomTabNavigationProp } from "@react-navigation/bottom-tabs/unstable";
import { createContext, use, useLayoutEffect, useState, type ReactNode } from "react";
import { Pressable } from "react-native";

import { LIVE_ACCESSORY_HEIGHT, LiveAccessoryHeight } from "../components/ui/tabBar";
import { BarContent, LivePicker, liveBar, useLiveSessions, useOpenLive } from "./LiveBar";

type Placement = "regular" | "inline";

const PickLive = createContext<(picking: boolean) => void>(() => undefined);

/**
 * The iOS 26 tab bar owns the LiveBar as its bottom accessory, and renders it twice: above the tab
 * bar and inline beside it when it minimizes. State both copies share lives here, above them.
 */
export function LiveAccessoryHost({ children }: { children: ReactNode }) {
  const live = useLiveSessions();
  const [picking, setPicking] = useState(false);

  return (
    <LiveAccessoryHeight value={live.length > 0 ? LIVE_ACCESSORY_HEIGHT : 0}>
      <PickLive value={setPicking}>
        {children}
        {picking ? <LivePicker live={live} onClose={() => setPicking(false)} /> : null}
      </PickLive>
    </LiveAccessoryHeight>
  );
}

function LiveAccessory({ placement }: { placement: Placement }) {
  const live = useLiveSessions();
  const open = useOpenLive();
  const pick = use(PickLive);
  const bar = liveBar(live, open, () => pick(true));

  if (!bar) return null;

  const { label, hint, onPress, ...content } = bar;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      className="flex-1"
    >
      <BarContent
        {...content}
        className={
          placement === "inline" ? "min-h-0 flex-1 gap-2 px-3 py-0" : "min-h-0 flex-1 py-0"
        }
      />
    </Pressable>
  );
}

const renderLiveAccessory = ({ placement }: { placement: Placement }) => (
  <LiveAccessory placement={placement} />
);

function LiveAccessoryOptions({ children }: { children: ReactNode }) {
  const navigation = useNavigation<NativeBottomTabNavigationProp<ParamListBase>>();
  const live = use(LiveAccessoryHeight) > 0;

  useLayoutEffect(() => {
    navigation.setOptions({ bottomAccessory: live ? renderLiveAccessory : undefined });
  }, [navigation, live]);

  return children;
}

/**
 * Hands the tab bar its accessory while something is live. With nothing live the option must be
 * undefined, not a function returning null: that would still mount an empty glass capsule.
 *
 * React Navigation calls `screenLayout` as a plain function while the navigator renders, so this
 * must return an element and keep its hooks in a component below it.
 */
export const liveAccessoryLayout = ({ children }: { children: ReactNode }) => (
  <LiveAccessoryOptions>{children}</LiveAccessoryOptions>
);

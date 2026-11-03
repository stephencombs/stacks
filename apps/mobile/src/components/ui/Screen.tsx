import { createContext, use, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { LiveBar, type ShowsTable } from "../../features/LiveBar";
import { ToastHost } from "./Toast";

/** How tall the tab bar is under the current screen: zero outside the places. */
export const TabBarHeight = createContext(0);

/**
 * A scrolling screen on the canvas, padded clear of the home indicator and any tab bar, that can
 * show toasts and the live bar for your table. `shows` is what of your table the screen already
 * shows, so the bar stays away there.
 */
export function Screen({ children, shows }: { children: ReactNode; shows?: ShowsTable }) {
  const bar = use(TabBarHeight);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      <ToastHost {...(bar ? { above: bar } : {})}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName="gap-6 px-4 pt-4 pb-24"
        >
          {children}
        </ScrollView>
      </ToastHost>
      <LiveBar {...(shows ? { shows } : {})} {...(bar ? { bottom: bar } : {})} />
    </KeyboardAvoidingView>
  );
}

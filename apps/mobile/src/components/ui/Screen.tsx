import { createContext, use, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveBar, type ShowsTable } from "../../features/LiveBar";
import { useNativeHeaderActions } from "../../features/NativeHeaderActions";
import { FormError } from "./Field";
import { ToastHost, useToast, type Toast } from "./Toast";

/** How tall the tab bar is under the current screen: zero outside the places. */
export const TabBarHeight = createContext(0);

type Content = ReactNode | ((toast: (toast: Toast) => void) => ReactNode);

function Content({ children }: { children: Content }) {
  const toast = useToast();
  return typeof children === "function" ? children(toast) : children;
}

/**
 * A scrolling screen on the canvas, padded clear of the home indicator and any tab bar, that can
 * show toasts and the live bar for your table. `shows` is what of your table the screen already
 * shows, so the bar stays away there.
 */
export function Screen({
  children,
  shows,
  renderFooter,
}: {
  children: Content;
  shows?: ShowsTable;
  renderFooter?: (toast: (toast: Toast) => void) => ReactNode;
}) {
  const footer = renderFooter;
  const header = useNativeHeaderActions();
  const bar = use(TabBarHeight);
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const [liveBarHeight, setLiveBarHeight] = useState(0);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      {header}
      <ToastHost {...(footer ? { above: footerHeight } : bar ? { above: bar } : {})}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName="gap-6 px-4 pt-4 pb-24"
        >
          <Content>{children}</Content>
          {/* The floating tab bar sits over the scene's foot on every platform, so the list ends clear of it. */}
          <View style={{ height: (footer ? footerHeight : bar) + liveBarHeight }} />
        </ScrollView>
        {footer ? (
          <View
            pointerEvents="box-none"
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
            style={{ paddingBottom: bar || Math.max(insets.bottom, 12) }}
            className="absolute inset-x-0 bottom-0"
          >
            <View className="gap-2 px-4 py-3">
              <Content>{footer}</Content>
            </View>
          </View>
        ) : null}
      </ToastHost>
      <LiveBar
        onHeightChange={setLiveBarHeight}
        {...(shows ? { shows } : {})}
        {...(footer ? { bottom: footerHeight } : bar ? { bottom: bar } : {})}
      />
    </KeyboardAvoidingView>
  );
}

export function screenError(message: string) {
  return (
    <Screen>
      <FormError>{message}</FormError>
    </Screen>
  );
}

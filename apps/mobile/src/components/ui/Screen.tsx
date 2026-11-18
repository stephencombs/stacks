import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { LiveBar, type ShowsTable } from "../../features/LiveBar";
import { useNativeHeaderActions } from "../../features/NativeHeaderActions";
import { FormError } from "./Field";
import { FloatingAction } from "./FloatingAction";
import { PinnedFooter } from "./PinnedFooter";
import { useScreenFoot } from "./tabBar";
import { ToastHost, useToast, type Toast } from "./Toast";

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
  fab,
}: {
  children: Content;
  shows?: ShowsTable;
  renderFooter?: ((toast: (toast: Toast) => void) => ReactNode) | undefined;
  /** A floating action button, bottom right above the live bar. */
  fab?: ReactNode;
}) {
  const footer = renderFooter;
  const header = useNativeHeaderActions();
  const foot = useScreenFoot({ footer: !!footer, fab: !!fab, footerGap: 12 });
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      {header}
      <ToastHost {...(foot.above === undefined ? {} : { above: foot.above })}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          style={foot.scrollStyle}
          contentContainerClassName="gap-6 px-4 pt-4 pb-24"
        >
          <Content>{children}</Content>
          <View style={{ height: foot.endSpace }} />
        </ScrollView>
        {fab ? (
          <FloatingAction right={16} bottom={foot.fabBottom}>
            {fab}
          </FloatingAction>
        ) : null}
        {footer ? (
          <PinnedFooter onLayout={foot.onFooterLayout} inset={foot.footerInset}>
            <Content>{footer}</Content>
          </PinnedFooter>
        ) : null}
      </ToastHost>
      <LiveBar
        onHeightChange={foot.onLiveBarHeight}
        {...(shows ? { shows } : {})}
        {...(foot.above === undefined ? {} : { bottom: foot.above })}
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

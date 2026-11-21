import * as Predicate from "effect/Predicate";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { LiveBar, type ShowsTable } from "../../features/LiveBar";
import { useNativeHeaderActions } from "../../features/NativeHeaderActions";
import { FormError } from "./Field";
import { cn } from "./cn";
import { FloatingAction } from "./FloatingAction";
import { PinnedFooter } from "./PinnedFooter";
import { SheetHost } from "./Sheet";
import { useScreenFoot } from "./tabBar";
import { ToastHost, useToast, type Toast } from "./Toast";

type Content = ReactNode | ((toast: (toast: Toast) => void) => ReactNode);

function isToastContent(
  children: Content,
): children is (toast: (toast: Toast) => void) => ReactNode {
  return Predicate.isFunction(children);
}

function Content({ children }: { children: Content }) {
  const toast = useToast();

  return isToastContent(children) ? children(toast) : children;
}

/**
 * A scrolling screen on the canvas, padded clear of the home indicator and any tab bar, that can
 * show toasts and the live bar for your table. `shows` is what of your table the screen already
 * shows, so the bar stays away there.
 */
export function Screen({
  children,
  shows,
  live = true,
  renderFooter,
  fab,
  contentClassName,
}: {
  children: Content;
  shows?: ShowsTable;
  live?: boolean;
  renderFooter?: ((toast: (toast: Toast) => void) => ReactNode) | undefined;
  /** A floating action button, bottom right above the live bar. */
  fab?: ReactNode;
  contentClassName?: string;
}) {
  const footer = renderFooter;
  const header = useNativeHeaderActions();
  const foot = useScreenFoot({ footer: !!footer, fab: !!fab, footerGap: 12 });

  return (
    <SheetHost>
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
            contentContainerClassName={cn("gap-6 px-4 pt-4 pb-24", contentClassName)}
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
        {live ? (
          <LiveBar
            onHeightChange={foot.onLiveBarHeight}
            {...(shows ? { shows } : {})}
            {...(foot.above === undefined ? {} : { bottom: foot.above })}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SheetHost>
  );
}

export function screenError(message: string) {
  return (
    <Screen>
      <FormError>{message}</FormError>
    </Screen>
  );
}

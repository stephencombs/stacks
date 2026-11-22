import * as Predicate from "effect/Predicate";
import { useRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
} from "react-native";

import { LiveBar, type ShowsTable } from "../../features/LiveBar";
import { FeltStatusBar } from "../../features/FeltStatusBar";
import { useNativeHeaderActions } from "../../features/NativeHeaderActions";
import { FormError } from "./Field";
import { cn } from "./cn";
import { FloatingAction } from "./FloatingAction";
import { PinnedFooter } from "./PinnedFooter";
import { clampedScrollOffset } from "./scrollClamp";
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
  onOpenGroups,
}: {
  children: Content;
  shows?: ShowsTable;
  live?: boolean;
  renderFooter?: ((toast: (toast: Toast) => void) => ReactNode) | undefined;
  /** A floating action button, bottom right above the live bar. */
  fab?: ReactNode;
  contentClassName?: string;
  onOpenGroups?: () => void;
}) {
  const footer = renderFooter;
  const header = useNativeHeaderActions(false, onOpenGroups);
  const foot = useScreenFoot({ footer: !!footer, fab: !!fab, footerGap: 12 });
  const scrollRef = useRef<ScrollViewInstance>(null);

  const scrollState = useRef({
    offsetY: 0,
    insetTop: 0,
    insetBottom: 0,
    layoutHeight: 0,
    scrolled: false,
  });

  return (
    <SheetHost>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
      >
        {header}
        <FeltStatusBar felt={false} />
        <ToastHost {...(foot.above === undefined ? {} : { above: foot.above })}>
          <ScrollView
            ref={scrollRef}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            alwaysBounceVertical={false}
            scrollEventThrottle={32}
            onLayout={(event) => {
              scrollState.current.layoutHeight = event.nativeEvent.layout.height;
            }}
            onScroll={(event) => {
              const { contentOffset, contentInset, layoutMeasurement } = event.nativeEvent;
              scrollState.current.offsetY = contentOffset.y;
              scrollState.current.insetTop = contentInset?.top ?? 0;
              scrollState.current.insetBottom = contentInset?.bottom ?? 0;
              scrollState.current.layoutHeight = layoutMeasurement.height;
              scrollState.current.scrolled = true;
            }}
            onContentSizeChange={(_width, height) => {
              const next = clampedScrollOffset(scrollState.current, height);

              if (next !== null) {
                scrollState.current.offsetY = next;
                scrollRef.current?.scrollTo({ y: next, animated: true });
              }
            }}
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

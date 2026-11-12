import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, ScreenStack, ScreenStackHeaderConfig } from "react-native-screens";
import { FormSheet } from "react-native-screens/experimental";
import { useCSSVariable } from "uniwind";

import { keyboardOverlap, sheetBottomEdge } from "./keyboardInset";

export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  busy?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [canvas, ink] = useCSSVariable(["--color-canvas", "--color-ink"]).map(String);
  const [closing, setClosing] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [keyboard, setKeyboard] = useState(0);
  const bottomEdge = useRef(screenHeight);
  const scroll = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const frame = useRef({ y: 0, height: 0 });
  const keyboardFrame = useRef<{ screenY: number; height: number } | null>(null);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillChangeFrame", (event) => {
      keyboardFrame.current = event.endCoordinates;
      setKeyboard(keyboardOverlap(bottomEdge.current, event.endCoordinates));
    });
    const hidden = Keyboard.addListener("keyboardWillHide", () => {
      keyboardFrame.current = null;
      setKeyboard(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const fittedHeight = contentHeight + insets.bottom + 64;
  const detent =
    contentHeight === 0 ? 0.5 : Math.min(0.9, Math.max(0.3, fittedHeight / screenHeight));
  const close = () => {
    if (!busy) setClosing(true);
  };
  const dismissed = () => {
    if (closing) {
      setClosing(false);
      onClose();
    }
  };
  const revealFocusedField = () => {
    if (!keyboardFrame.current) return;
    TextInput.State.currentlyFocusedInput()?.measureInWindow((_x, y, _width, height) => {
      const top = frame.current.y + 12;
      const bottom = frame.current.y + frame.current.height - footerHeight - 12;
      if (y < top) {
        scroll.current?.scrollTo({ y: Math.max(0, offset.current - (top - y)), animated: false });
      } else if (y + height > bottom) {
        scroll.current?.scrollTo({ y: offset.current + y + height - bottom, animated: false });
      }
    });
  };

  return (
    <FormSheet
      isOpen={open && !closing}
      detents={[detent, 1]}
      prefersGrabberVisible
      preventNativeDismiss={busy}
      nativeContainerStyle={{ backgroundColor: canvas }}
      onDismiss={dismissed}
      onNativeDismiss={onClose}
    >
      <View collapsable={false} className="absolute inset-0 overflow-hidden bg-canvas">
        <ScreenStack style={{ flex: 1, backgroundColor: canvas, overflow: "hidden" }}>
          <Screen
            activityState={2}
            enabled
            isNativeStack
            screenId={`sheet-${id}`}
            style={{ flex: 1, backgroundColor: canvas }}
          >
            <View
              className="flex-1"
              style={{ paddingBottom: Math.max(insets.bottom, keyboard) }}
              onLayout={(event) => {
                const target = event.target;
                if (typeof target !== "object" || target == null) return;
                target.measureInWindow((_x, y, _width, height) => {
                  bottomEdge.current = sheetBottomEdge(screenHeight, { y, height });
                  if (keyboardFrame.current) {
                    setKeyboard(keyboardOverlap(bottomEdge.current, keyboardFrame.current));
                  }
                });
              }}
            >
              <View className="flex-1 overflow-hidden">
                <ScrollView
                  ref={scroll}
                  className="flex-1"
                  contentInsetAdjustmentBehavior="automatic"
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  contentContainerClassName="gap-5 px-4 pt-4"
                  contentContainerStyle={{ paddingBottom: footerHeight + 24 }}
                  onContentSizeChange={(_width, height) => setContentHeight(height)}
                  onScroll={(event) => {
                    offset.current = event.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={32}
                  onLayout={(event) => {
                    const target = event.target;
                    if (typeof target !== "object" || target == null) return;
                    target.measureInWindow((_x, y, _width, height) => {
                      frame.current = { y, height };
                      revealFocusedField();
                    });
                  }}
                >
                  {description ? (
                    <Text className="px-1 type-callout text-muted">{description}</Text>
                  ) : null}
                  {children}
                </ScrollView>
                {footer ? (
                  <View
                    className="absolute right-0 bottom-0 left-0 gap-2 px-4 pt-2 pb-3"
                    onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
                  >
                    {footer}
                  </View>
                ) : null}
              </View>
            </View>
            <ScreenStackHeaderConfig
              backgroundColor="transparent"
              translucent
              color={ink}
              titleColor={ink}
              hideBackButton
              hideShadow
              title={title}
              titleFontSize={17}
              titleFontWeight="600"
              headerRightBarButtonItems={[
                {
                  type: "button",
                  icon: { type: "sfSymbol", name: "xmark" },
                  accessibilityLabel: `Close ${title}`,
                  identifier: `sheet-close-${id}`,
                  disabled: busy,
                  onPress: close,
                },
              ]}
            />
          </Screen>
        </ScreenStack>
      </View>
    </FormSheet>
  );
}

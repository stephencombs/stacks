import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { keyboardOverlap, sheetBottomEdge } from "./keyboardInset";
import { animate, duration, ease, isReducedMotion } from "./motion";

/**
 * A form or confirmation that slides up over the current screen. On Android it is a
 * bottom sheet: as tall as its content up to the screen below the status bar, with a dimmed scrim
 * above that closes it, a grabber, a centred title with a close button, and the main action
 * pinned to the bottom. iOS draws its own in `Sheet.ios.tsx`.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  busy = false,
  back = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** The sheet's main action, kept above the keyboard and the home indicator. */
  footer?: ReactNode;
  /** While a save is in flight, neither the close button nor Android's back closes it. */
  busy?: boolean;
  /** Shows a back chevron/arrow instead of Close when stacked onto another sheet. */
  back?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [leaving, setLeaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setLeaving(true);
  }
  const [keyboard, setKeyboard] = useState(0);
  const sheetBottom = useRef(0);
  const keyboardFrame = useRef<{ screenY: number; height: number } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);
  const scrollFrame = useRef({ y: 0, height: 0 });
  const revealAfterLayout = useRef(false);

  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const frameOf = (screenY: number, height: number) => {
      keyboardFrame.current = { screenY, height };
      const overlap = keyboardOverlap(
        sheetBottom.current || Dimensions.get("screen").height,
        keyboardFrame.current,
      );
      if (overlap > 0) revealAfterLayout.current = true;
      setKeyboard(overlap);
    };
    const shown = Keyboard.addListener(show, (event) => {
      frameOf(event.endCoordinates.screenY, event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hide, () => {
      keyboardFrame.current = null;
      revealAfterLayout.current = false;
      setKeyboard(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    if (open) animate(progress, { toValue: 1, duration: duration.sheetIn, easing: ease.enter });
    else
      animate(
        progress,
        { toValue: 0, duration: duration.sheetOut, easing: ease.exit },
        (finished) => {
          if (finished) setLeaving(false);
        },
      );
  }, [open, progress]);

  const bottom = Math.max(insets.bottom, keyboard);

  return (
    <Modal
      visible={open || leaving}
      transparent
      animationType="none"
      onRequestClose={busy ? () => {} : onClose}
    >
      <View
        className="flex-1 justify-end"
        onLayout={(event) => {
          measureInWindow(event.target, (y, height) => {
            const edge = sheetBottomEdge(Dimensions.get("screen").height, { y, height });
            sheetBottom.current = edge;
            if (!keyboardFrame.current) return;
            setKeyboard(keyboardOverlap(edge, keyboardFrame.current));
          });
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            accessible={false}
            disabled={busy}
            onPress={onClose}
            className="flex-1 bg-scrim"
          />
        </Animated.View>
        <Animated.View
          style={{
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [screenHeight, 0],
                }),
              },
            ],
          }}
        >
          <View
            className="overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-canvas"
            style={{ maxHeight: screenHeight - insets.top - 8, paddingBottom: bottom }}
          >
            <View className="items-center pt-3">
              <View className="h-1 w-8 rounded-full bg-fill-strong" />
            </View>
            <View className="min-h-14 flex-row items-center px-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={back ? "Back" : "Close"}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onClose}
                hitSlop={8}
                className="size-11 items-center justify-center"
              >
                <View className="size-9 items-center justify-center rounded-full bg-fill">
                  {back ? (
                    <View className="rotate-180">
                      <Icon name="arrow-right" color="ink" size={18} />
                    </View>
                  ) : (
                    <Icon name="close" color="ink" size={16} />
                  )}
                </View>
              </Pressable>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="flex-1 text-center type-body font-semibold text-ink"
              >
                {title}
              </Text>
              <View className="w-11" />
            </View>
            <ScrollView
              ref={scroll}
              className="shrink"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={32}
              onScroll={(event) => {
                scrollOffset.current = event.nativeEvent.contentOffset.y;
              }}
              onLayout={(event) => {
                const height = event.nativeEvent.layout.height;
                scrollFrame.current = { y: scrollFrame.current.y, height };
                measureInWindow(event.target, (y, measured) => {
                  scrollFrame.current = { y, height: measured };
                  if (!revealAfterLayout.current) return;
                  revealAfterLayout.current = false;
                  revealFocusedField(
                    scroll.current,
                    scrollOffset.current,
                    scrollFrame.current,
                    !isReducedMotion(),
                  );
                });
              }}
              contentContainerClassName={footer ? "gap-4 px-4 pt-2 pb-3" : "gap-5 px-4 pt-2 pb-8"}
            >
              {description ? (
                <Text className="px-1 text-center type-callout text-muted">{description}</Text>
              ) : null}
              {children}
            </ScrollView>
            {footer ? <View className="gap-2 px-4 pt-2 pb-3">{footer}</View> : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function measureInWindow(
  node: LayoutChangeEvent["target"],
  onFrame: (y: number, height: number) => void,
) {
  if (typeof node !== "object" || node == null) return;
  node.measureInWindow((_x, y, _width, height) => onFrame(y, height));
}

function revealFocusedField(
  scroll: ScrollViewInstance | null,
  offsetY: number,
  frame: { readonly y: number; readonly height: number },
  animated: boolean,
) {
  if (!scroll || frame.height <= 0) return;
  TextInput.State.currentlyFocusedInput()?.measureInWindow((_x, y, _width, height) => {
    const margin = 12;
    const viewBottom = frame.y + frame.height;
    if (y < frame.y + margin) {
      scroll.scrollTo({ y: Math.max(0, offsetY - (frame.y + margin - y)), animated });
    } else if (y + height > viewBottom - margin) {
      scroll.scrollTo({ y: offsetY + (y + height - (viewBottom - margin)), animated });
    }
  });
}

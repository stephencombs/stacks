import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { keyboardOverlap, sheetBottomEdge } from "./keyboardInset";

/**
 * A form or confirmation that slides up over the current screen, laid out like an iOS sheet: a
 * grabber, a centred title with a close button, and the main action pinned to the bottom.
 */
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
  /** The sheet's main action, kept above the keyboard and the home indicator. */
  footer?: ReactNode;
  /** While a save is in flight, neither the close button nor Android's back closes it. */
  busy?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
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

  const bottom = Math.max(insets.bottom, keyboard);

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={busy ? () => {} : onClose}
    >
      <View
        className="flex-1 bg-canvas"
        style={{ paddingBottom: bottom }}
        onLayout={(event) => {
          measureInWindow(event.target, (y, height) => {
            const edge = sheetBottomEdge(Dimensions.get("screen").height, { y, height });
            sheetBottom.current = edge;
            if (!keyboardFrame.current) return;
            setKeyboard(keyboardOverlap(edge, keyboardFrame.current));
          });
        }}
      >
        <View className="flex-1">
          <View className="items-center pt-2">
            <View className="h-[5px] w-9 rounded-full bg-line-strong" />
          </View>
          <View className="min-h-14 flex-row items-center px-4">
            <View className="w-11" />
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="flex-1 text-center type-body font-semibold text-ink"
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onClose}
              hitSlop={8}
              className="size-11 items-center justify-center"
            >
              <View className="size-8 items-center justify-center rounded-full bg-fill">
                <Icon name="close" color="muted" size={14} />
              </View>
            </Pressable>
          </View>
          <ScrollView
            ref={scroll}
            className="flex-1"
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
                revealFocusedField(scroll.current, scrollOffset.current, scrollFrame.current);
              });
            }}
            contentContainerClassName="gap-5 px-4 pt-2 pb-8"
          >
            {description ? (
              <Text className="px-1 text-center type-callout text-muted">{description}</Text>
            ) : null}
            {children}
          </ScrollView>
          {footer ? <View className="gap-2 px-4 pt-2 pb-3">{footer}</View> : null}
        </View>
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
) {
  if (!scroll || frame.height <= 0) return;
  TextInput.State.currentlyFocusedInput()?.measureInWindow((_x, y, _width, height) => {
    const margin = 12;
    const viewBottom = frame.y + frame.height;
    if (y < frame.y + margin) {
      scroll.scrollTo({ y: Math.max(0, offsetY - (frame.y + margin - y)), animated: true });
    } else if (y + height > viewBottom - margin) {
      scroll.scrollTo({ y: offsetY + (y + height - (viewBottom - margin)), animated: true });
    }
  });
}

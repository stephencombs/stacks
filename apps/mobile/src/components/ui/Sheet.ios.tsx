import { useId, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, ScreenStack, ScreenStackHeaderConfig } from "react-native-screens";
import { FormSheet } from "react-native-screens/experimental";
import { useCSSVariable } from "uniwind";

import type { SheetProps } from "./Sheet";

export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  confirm,
  busy = false,
  children,
}: SheetProps) {
  const id = useId();
  const { height: screenHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(screenHeight);
  const insets = useSafeAreaInsets();
  const [canvas, ink, danger] = useCSSVariable([
    "--color-canvas",
    "--color-ink",
    "--color-danger",
  ]).map(String);
  const [closing, setClosing] = useState(false);
  const saving = busy || confirm?.pending === true;
  const close = () => {
    if (!saving) setClosing(true);
  };
  const dismissed = () => {
    if (closing) {
      setClosing(false);
      onClose();
    }
  };
  return (
    <FormSheet
      isOpen={open && !closing}
      detents={[0.7, 1]}
      prefersGrabberVisible
      preventNativeDismiss={saving}
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
            <KeyboardAvoidingView
              behavior="padding"
              // Sheet layout starts at zero, while keyboard coordinates use the whole screen.
              keyboardVerticalOffset={Math.max(0, screenHeight - sheetHeight)}
              onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
              className="flex-1"
            >
              <View className="flex-1 overflow-hidden">
                <ScrollView
                  className="flex-1"
                  contentInsetAdjustmentBehavior="automatic"
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  contentContainerClassName="gap-5 px-4 pt-4"
                  contentContainerStyle={{ paddingBottom: footer ? 24 : insets.bottom + 24 }}
                >
                  {description ? (
                    <Text className="px-1 type-callout text-muted">{description}</Text>
                  ) : null}
                  {children}
                </ScrollView>
                {footer && !confirm ? (
                  <View
                    className="gap-2 px-4 pt-2"
                    style={{ paddingBottom: Math.max(insets.bottom, 12) }}
                  >
                    {footer}
                  </View>
                ) : null}
              </View>
            </KeyboardAvoidingView>
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
              headerLeftBarButtonItems={
                confirm
                  ? [
                      {
                        type: "button",
                        title: "Cancel",
                        accessibilityLabel: `Cancel ${title}`,
                        disabled: saving,
                        onPress: close,
                      },
                    ]
                  : undefined
              }
              headerRightBarButtonItems={
                confirm
                  ? [
                      {
                        type: "button",
                        title: confirm.pending ? "Saving…" : confirm.label,
                        variant:
                          Number.parseInt(String(Platform.Version), 10) >= 26
                            ? "prominent"
                            : "done",
                        ...(confirm.destructive ? { tintColor: danger } : {}),
                        accessibilityLabel: confirm.label,
                        disabled: saving || confirm.disabled,
                        onPress: confirm.onPress,
                      },
                    ]
                  : [
                      {
                        type: "button",
                        icon: { type: "sfSymbol", name: "xmark" },
                        accessibilityLabel: `Close ${title}`,
                        identifier: `sheet-close-${id}`,
                        disabled: saving,
                        onPress: close,
                      },
                    ]
              }
            />
          </Screen>
        </ScreenStack>
      </View>
    </FormSheet>
  );
}

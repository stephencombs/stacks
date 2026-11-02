import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "./Icon";

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
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** The sheet's main action, kept above the keyboard and the home indicator. */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* SafeAreaView takes no className, so the sheet's color sits on a plain View. */}
      <View className="flex-1 bg-canvas">
        <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1"
          >
            <View className="items-center pt-2">
              <View className="h-[5px] w-9 rounded-full bg-line-strong" />
            </View>
            <View className="min-h-14 flex-row items-center px-4">
              <View className="w-11" />
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="flex-1 text-center text-[17px] font-semibold text-ink"
              >
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
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
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-5 px-4 pt-2 pb-8"
            >
              {description ? (
                <Text className="px-1 text-center text-[15px] text-muted">{description}</Text>
              ) : null}
              {children}
            </ScrollView>
            {footer ? <View className="gap-2 px-4 pt-2 pb-3">{footer}</View> : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

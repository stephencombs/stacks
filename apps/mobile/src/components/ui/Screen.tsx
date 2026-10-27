import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

/** A scrolling screen on the canvas, padded clear of the home indicator. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pt-4 pb-16"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

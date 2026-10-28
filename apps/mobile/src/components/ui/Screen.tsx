import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { ToastHost } from "./Toast";

/** A scrolling screen on the canvas, padded clear of the home indicator, that can show toasts. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
    >
      <ToastHost>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName="gap-6 px-4 pt-4 pb-24"
        >
          {children}
        </ScrollView>
      </ToastHost>
    </KeyboardAvoidingView>
  );
}

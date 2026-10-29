import type { SessionId } from "@stacks/contracts";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { LiveBar } from "../../features/LiveBar";
import { ToastHost } from "./Toast";

/**
 * A scrolling screen on the canvas, padded clear of the home indicator, that can show toasts and
 * the live bar for your table. `table` is the session a screen shows itself, so no bar for it.
 */
export function Screen({ children, table }: { children: ReactNode; table?: SessionId }) {
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
      <LiveBar {...(table ? { except: table } : {})} />
    </KeyboardAvoidingView>
  );
}

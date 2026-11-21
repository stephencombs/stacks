import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, AccessibilityInfo, Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { animate, duration, ease, useReducedMotion } from "./motion";

export type Toast = {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
};

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Shows a toast at the bottom of the screen. A new toast replaces the one showing. */
export const useToast = () => use(ToastContext);

const VISIBLE_MS = 6000;

/** `above` keeps toasts clear of something pinned to the bottom, such as a tab bar. */
export function ToastHost({ children, above }: { children: ReactNode; above?: number }) {
  useReducedMotion();
  const [current, setCurrent] = useState<(Toast & { readonly id: number }) | null>(null);
  const nextId = useRef(0);
  const [show] = useState(() => (toast: Toast) => setCurrent({ ...toast, id: nextId.current++ }));
  const [clear] = useState(() => () => setCurrent(null));

  useEffect(() => {
    if (current) AccessibilityInfo.announceForAccessibility(current.message);
  }, [current]);

  return (
    <ToastContext value={show}>
      {children}
      {current ? (
        <ToastView key={current.id} toast={current} onClosed={clear} above={above} />
      ) : null}
    </ToastContext>
  );
}

function ToastView({
  toast,
  onClosed,
  above,
}: {
  toast: Toast;
  onClosed: () => void;
  above: number | undefined;
}) {
  const insets = useSafeAreaInsets();
  const [shown] = useState(() => new Animated.Value(0));
  const closing = useRef(false);

  const [close] = useState(() => () => {
    if (closing.current) return;
    closing.current = true;
    animate(shown, { toValue: 0, duration: duration.toastOut, easing: ease.exit }, (finished) =>
      finished ? onClosed() : undefined,
    );
  });

  useEffect(() => {
    animate(shown, { toValue: 1, duration: duration.toastIn, easing: ease.enter });
    const hide = setTimeout(close, VISIBLE_MS);

    return () => clearTimeout(hide);
  }, [shown, close]);

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 px-4"
      style={
        above === undefined
          ? { bottom: 0, paddingBottom: Math.max(insets.bottom, 12) }
          : { bottom: above + 8 }
      }
    >
      <Animated.View
        style={{
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <View
          accessibilityLiveRegion="polite"
          className={
            Platform.OS === "android"
              ? "min-h-12 flex-row items-center gap-3 rounded-[4px] bg-[#1F2120] py-1.5 pr-2 pl-4 shadow-lg"
              : "min-h-13 flex-row items-center gap-3 rounded-xl border border-fill-strong bg-surface py-1.5 pr-1.5 pl-4"
          }
        >
          <Text
            className={
              Platform.OS === "android"
                ? "flex-1 text-base text-white"
                : "flex-1 text-base text-ink"
            }
          >
            {toast.message}
          </Text>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (closing.current) return;
                toast.action?.onPress();
                close();
              }}
              className="min-h-11 justify-center rounded px-3 active:opacity-70"
            >
              <Text
                className={
                  Platform.OS === "android"
                    ? "text-base font-semibold text-[#6EE7B7]"
                    : "text-base font-semibold text-ink"
                }
              >
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

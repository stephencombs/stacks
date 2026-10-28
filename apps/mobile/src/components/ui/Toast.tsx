import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type Toast = {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
};

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Shows a toast at the bottom of the screen. A new toast replaces the one showing. */
export const useToast = () => use(ToastContext);

const VISIBLE_MS = 6000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Toast & { readonly id: number }) | null>(null);
  const nextId = useRef(0);
  const [show] = useState(() => (toast: Toast) => setCurrent({ ...toast, id: nextId.current++ }));

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    const hide = setTimeout(() => setCurrent(null), VISIBLE_MS);
    return () => clearTimeout(hide);
  }, [current]);

  return (
    <ToastContext value={show}>
      {children}
      {current ? (
        <ToastView key={current.id} toast={current} onDismiss={() => setCurrent(null)} />
      ) : null}
    </ToastContext>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const [shown] = useState(() => new Animated.Value(0));
  const [rise, setRise] = useState(8);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => setRise(reduced ? 0 : 8));
    Animated.timing(shown, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [shown]);

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <Animated.View
        style={{
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
          ],
        }}
      >
        <View
          accessibilityLiveRegion="polite"
          className="min-h-13 flex-row items-center gap-3 rounded-2xl bg-accent py-1.5 pr-1.5 pl-4"
        >
          <Text className="flex-1 text-base text-accent-ink">{toast.message}</Text>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                toast.action?.onPress();
                onDismiss();
              }}
              className="min-h-11 justify-center rounded-xl px-3 active:opacity-70"
            >
              <Text className="text-base font-semibold text-accent-ink">{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

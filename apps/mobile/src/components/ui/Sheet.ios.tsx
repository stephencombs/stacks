import {
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Animated,
  Keyboard,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { Text } from "./Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, ScreenStack, ScreenStackHeaderConfig } from "react-native-screens";
import { FormSheet } from "react-native-screens/experimental";
import { useCSSVariable, useUniwind } from "uniwind";

import { cn } from "./cn";
import { keyboardOverlap, sheetBottomEdge } from "./keyboardInset";
import { animate, duration, ease, useReducedMotion } from "./motion";
import {
  InSheet,
  SheetStoreContext,
  useCreateSheetStore,
  type SheetRegistration,
  type SheetStore,
} from "./sheetContext";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  footer?: ReactNode | undefined;
  busy?: boolean;
  back?: boolean;
  large?: boolean;
  hideHeader?: boolean;
  floatingFooter?: boolean;
  children?: ReactNode | undefined;
};

let nextSheetId = 1;

const detentGrowth = 24;

/** Mounts one shared native `FormSheet` host so swapping child sheets never closes and drops them. */
export function SheetHost({ children }: { children?: ReactNode }) {
  const store = useCreateSheetStore();

  return (
    <SheetStoreContext value={store}>
      {children}
      <SheetPortal store={store} />
    </SheetStoreContext>
  );
}

/**
 * An iOS native modal presentation (`FormSheet`). Inside a `SheetHost`, sheets swap inside one
 * persistent presenter; without a host (such as a header-launched sheet), it presents itself.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  busy = false,
  back = false,
  large = false,
  hideHeader = false,
  floatingFooter = false,
  children,
}: SheetProps) {
  const store = use(SheetStoreContext);

  if (store !== null) {
    return (
      <PortaledSheet
        store={store}
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        footer={footer}
        busy={busy}
        back={back}
        large={large}
        hideHeader={hideHeader}
        floatingFooter={floatingFooter}
      >
        {children}
      </PortaledSheet>
    );
  }

  return (
    <StandaloneSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      busy={busy}
      back={back}
      large={large}
      hideHeader={hideHeader}
      floatingFooter={floatingFooter}
    >
      {children}
    </StandaloneSheet>
  );
}

function PortaledSheet({
  store,
  open,
  onClose,
  title,
  description,
  footer,
  busy = false,
  back = false,
  large = false,
  hideHeader = false,
  floatingFooter = false,
  children,
}: SheetProps & { store: SheetStore }) {
  const [id] = useState(() => nextSheetId++);

  useLayoutEffect(() => {
    if (!open) {
      store.release(id);

      return;
    }

    store.claim({
      id,
      title,
      description,
      footer,
      busy,
      back,
      large,
      hideHeader,
      floatingFooter,
      onClose,
      children,
    });
  }, [
    store,
    id,
    open,
    title,
    description,
    footer,
    busy,
    back,
    large,
    hideHeader,
    floatingFooter,
    onClose,
    children,
  ]);

  useLayoutEffect(() => () => store.release(id), [store, id]);

  return null;
}

function StandaloneSheet({
  open,
  onClose,
  title,
  description,
  footer,
  busy = false,
  back = false,
  large = false,
  hideHeader = false,
  floatingFooter = false,
  children,
}: SheetProps) {
  const id = useId();
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (!busy) setClosing(true);
  };

  const dismissed = () => {
    if (closing) {
      setClosing(false);
      onClose();
    }
  };

  return (
    <NativeFormSheet
      isOpen={open && !closing}
      slotKey={id}
      title={title}
      description={description}
      footer={footer}
      busy={busy}
      back={back}
      large={large}
      hideHeader={hideHeader}
      floatingFooter={floatingFooter}
      onHeaderPress={close}
      onDismiss={dismissed}
      onNativeDismiss={onClose}
    >
      {children}
    </NativeFormSheet>
  );
}

function SheetPortal({ store }: { store: SheetStore }) {
  const slot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const [presentation, setPresentation] = useState<{
    slot: SheetRegistration;
    direction: -1 | 0 | 1;
  } | null>(null);

  const [nativeDismissing, setNativeDismissing] = useState(false);

  if (slot !== null && slot !== presentation?.slot) {
    let direction: -1 | 0 | 1 = 0;

    if (presentation) {
      if (presentation.slot.id === slot.id) direction = presentation.direction;
      else if (slot.back) direction = 1;
      else if (presentation.slot.back) direction = -1;
    }

    setPresentation({ slot, direction });
  }

  useEffect(() => {
    if (!nativeDismissing) return;
    let active = true;

    void Promise.resolve().then(() => {
      if (active) setNativeDismissing(false);
    });

    return () => {
      active = false;
    };
  }, [nativeDismissing]);

  const presented = presentation?.slot;

  if (!presented) return null;

  return (
    <NativeFormSheet
      isOpen={slot !== null && !nativeDismissing}
      slotKey={`portal-${presented.id}`}
      title={presented.title}
      description={presented.description}
      footer={presented.footer}
      busy={presented.busy}
      back={presented.back}
      large={presented.large}
      hideHeader={presented.hideHeader}
      floatingFooter={presented.floatingFooter}
      onHeaderPress={() => {
        if (slot && !slot.busy) slot.onClose();
      }}
      onDismiss={() => {
        if (slot === null) setPresentation(null);
      }}
      onNativeDismiss={() => {
        if (!slot || slot.busy) return;
        setNativeDismissing(true);
        slot.onClose();
      }}
    >
      {presentation.direction === 0 ? (
        presented.children
      ) : (
        <SheetPage key={presented.id} direction={presentation.direction}>
          {presented.children}
        </SheetPage>
      )}
    </NativeFormSheet>
  );
}

function SheetPage({ children, direction }: { children: ReactNode; direction: -1 | 1 }) {
  const [translateX] = useState(() => new Animated.Value(direction * 28));
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (reduced) translateX.setValue(0);
    else animate(translateX, { toValue: 0, duration: duration.menuIn, easing: ease.enter });

    return () => translateX.stopAnimation();
  }, [reduced, translateX]);

  return <Animated.View style={{ gap: 20, transform: [{ translateX }] }}>{children}</Animated.View>;
}

function NativeFormSheet({
  isOpen,
  slotKey,
  title,
  description,
  footer,
  busy,
  back,
  large,
  hideHeader,
  floatingFooter,
  onHeaderPress,
  onDismiss,
  onNativeDismiss,
  children,
}: {
  isOpen: boolean;
  slotKey: string;
  title: string;
  description?: string | undefined;
  footer?: ReactNode | undefined;
  busy: boolean;
  back: boolean;
  large: boolean;
  hideHeader: boolean;
  floatingFooter: boolean;
  onHeaderPress: () => void;
  onDismiss: () => void;
  onNativeDismiss: () => void;
  children?: ReactNode | undefined;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();

  const [canvas, surface, ink] = useCSSVariable([
    "--color-canvas",
    "--color-surface",
    "--color-ink",
  ]).map(String);

  const sheetBg = theme === "dark" ? surface! : canvas!;
  const sheetBgClass = theme === "dark" ? "bg-surface" : "bg-canvas";
  const [measured, setMeasured] = useState({ key: slotKey, content: 0, footer: 0 });
  const [keyboard, setKeyboard] = useState(0);
  const bottomEdge = useRef(screenHeight);
  const scroll = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const frame = useRef({ y: 0, height: 0 });
  const keyboardFrame = useRef<{ screenY: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (slotKey) offset.current = 0;
  }, [slotKey]);

  const contentHeight = measured.key === slotKey ? measured.content : 0;
  const footerHeight = measured.key === slotKey ? measured.footer : 0;

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

  const [settled, setSettled] = useState({ key: slotKey, height: 0 });
  const settledHeight = settled.key === slotKey ? settled.height : 0;
  const measuredHeight = contentHeight + footerHeight + insets.bottom + 80;

  const fittedHeight =
    contentHeight > 0 && (settledHeight === 0 || measuredHeight - settledHeight >= detentGrowth)
      ? measuredHeight
      : settledHeight || measuredHeight;

  const nextSettled = !isOpen || large || contentHeight === 0 ? 0 : fittedHeight;

  if (nextSettled !== settledHeight) setSettled({ key: slotKey, height: nextSettled });

  const maximumDetentHeight = Math.max(1, screenHeight - insets.top - insets.bottom);

  const detent = large
    ? 1
    : contentHeight === 0
      ? footer
        ? 0.65
        : 0.5
      : Math.min(1, Math.max(0.3, fittedHeight / maximumDetentHeight));

  const revealFocusedField = () => {
    if (!keyboardFrame.current) return;
    TextInput.State.currentlyFocusedInput()?.measureInWindow((_x, y, _width, height) => {
      const top = frame.current.y + 12;
      const bottom = frame.current.y + frame.current.height - 12;

      if (y < top) {
        scroll.current?.scrollTo({ y: Math.max(0, offset.current - (top - y)), animated: false });
      } else if (y + height > bottom) {
        scroll.current?.scrollTo({ y: offset.current + y + height - bottom, animated: false });
      }
    });
  };

  return (
    <FormSheet
      isOpen={isOpen}
      detents={detent === 1 ? [1] : [detent, 1]}
      prefersGrabberVisible
      preventNativeDismiss={busy}
      nativeContainerStyle={{ backgroundColor: sheetBg }}
      onDismiss={onDismiss}
      onNativeDismiss={onNativeDismiss}
    >
      <View collapsable={false} className={cn("absolute inset-0 overflow-hidden", sheetBgClass)}>
        <ScreenStack style={{ flex: 1, backgroundColor: sheetBg, overflow: "hidden" }}>
          <Screen
            activityState={2}
            enabled
            isNativeStack
            screenId={`sheet-${slotKey}`}
            style={{ flex: 1, backgroundColor: sheetBg }}
          >
            <InSheet value={true}>
              <View
                key={slotKey}
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
                    key={slotKey}
                    ref={scroll}
                    className="flex-1"
                    contentInsetAdjustmentBehavior="automatic"
                    alwaysBounceVertical={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerClassName={cn(
                      "gap-5 px-4",
                      hideHeader ? "pt-6" : "pt-4",
                      floatingFooter ? "pb-24" : "pb-4",
                    )}
                    onContentSizeChange={
                      large
                        ? undefined
                        : (_width, height) =>
                            setMeasured((prev) =>
                              prev.key === slotKey
                                ? { ...prev, content: height }
                                : { key: slotKey, content: height, footer: 0 },
                            )
                    }
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
                    floatingFooter ? (
                      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-3 px-4">
                        {footer}
                      </View>
                    ) : (
                      <View
                        className={cn("gap-2 border-t border-line px-4 pt-2 pb-3", sheetBgClass)}
                        onLayout={(event) => {
                          const height = event.nativeEvent.layout.height;
                          setMeasured((prev) =>
                            prev.key === slotKey
                              ? { ...prev, footer: height }
                              : { key: slotKey, content: 0, footer: height },
                          );
                        }}
                      >
                        {footer}
                      </View>
                    )
                  ) : null}
                </View>
              </View>
            </InSheet>
            <ScreenStackHeaderConfig
              hidden={hideHeader}
              backgroundColor={sheetBg}
              translucent={false}
              color={ink}
              titleColor={ink}
              hideBackButton
              hideShadow
              title={title}
              titleFontSize={17}
              titleFontWeight="600"
              headerLeftBarButtonItems={
                back
                  ? [
                      {
                        type: "button",
                        icon: { type: "sfSymbol", name: "chevron.backward" },
                        accessibilityLabel: "Back",
                        identifier: `sheet-back-${slotKey}`,
                        disabled: busy,
                        onPress: onHeaderPress,
                      },
                    ]
                  : []
              }
              headerRightBarButtonItems={
                back
                  ? []
                  : [
                      {
                        type: "button",
                        icon: { type: "sfSymbol", name: "xmark" },
                        accessibilityLabel: `Close ${title}`,
                        identifier: `sheet-close-${slotKey}`,
                        disabled: busy,
                        onPress: onHeaderPress,
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

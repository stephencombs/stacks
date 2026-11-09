import { sampleTrip } from "@stacks/client-runtime/sample";
import * as Haptics from "expo-haptics";
import { useEffect, useEffectEvent, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { SignInButton } from "./SignInButton";
import { TripHero } from "./TripHero";

const SNAP = Easing.bezier(0.32, 0.72, 0, 1);
const SHIFT_MS = 250;
/** Phone-width column. Wider windows center it; the frame itself never grows into a page. */
const FRAME = 440;
/**
 * The sample trip card is a fixed block (figure, line, tiles). Show it only when the step
 * still has room for its title, so a short phone clips nothing and never scrolls.
 */
const TRIP_MIN_PAGE = 530;

const steps = [
  {
    title: "Keep the casino trip honest.",
    body: "Log buy-ins and cash-outs as you play. Color Up works out everyone's results and who owes whom. You pay each other however you like.",
  },
  {
    title: "Log it at the table.",
    body: "Buy-ins and cash-outs take a few taps. A rebuy repeats your last amount in one.",
  },
  {
    title: "Watch the board.",
    body: "Everyone's running total, session by session, with your line in gold.",
  },
  {
    title: "Settle up once.",
    body: "The fewest payments that square everyone. Color Up never moves money.",
  },
] as const;

const accountCopy = {
  title: "Start a group.",
  body: "Create an account, or sign in if you already have one. Color Up never moves money.",
};

const invitedCopy = {
  title: "You've been invited to a group.",
  body: "Sign in or create an account to see who invited you and join their ledger.",
};

const tripLabel =
  "An example trip card: up $275 after three sessions and two nights, first on the board.";

const tripTitle = "Watch the board.";

type ScrollEnd = NativeSyntheticEvent<NativeScrollEvent>;

const heightOf = (event: LayoutChangeEvent) => Math.round(event.nativeEvent.layout.height);

const pageOf = (event: ScrollEnd) => {
  const viewport = event.nativeEvent.layoutMeasurement.width;
  if (viewport <= 0) return null;
  const page = Math.round(event.nativeEvent.contentOffset.x / viewport);
  return Math.min(steps.length - 1, Math.max(0, page));
};

function DisplayTitle({ children, compact }: { children: string; compact: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={3}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={compact ? 1.15 : 1.3}
      className={
        compact
          ? "type-headline text-ink"
          : "font-display text-6xl leading-[52px] text-ink uppercase"
      }
    >
      {children}
    </Text>
  );
}

function StepBody({ children }: { children: string }) {
  return (
    <Text className="text-lg leading-7 text-muted" numberOfLines={5} maxFontSizeMultiplier={1.35}>
      {children}
    </Text>
  );
}

/**
 * Signed-out onboarding. One step fills the frame, then the account screen. Nothing scrolls. An
 * invitation opens straight on the account screen.
 */
export function Landing({
  invited = false,
  onRecord,
}: {
  invited?: boolean;
  /** Leaves for your own play, which needs no account. */
  onRecord?: () => void;
}) {
  const copy = invited ? invitedCopy : accountCopy;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frame = Math.min(width, FRAME);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const [translateX] = useState(() => new Animated.Value(0));
  const indexRef = useRef(0);
  const dragging = useRef(false);
  const accountRef = useRef(invited);
  const [index, setIndex] = useState(0);
  const [account, setAccount] = useState(invited);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const compact = bodyHeight > 0 && bodyHeight < 520;
  const last = index === steps.length - 1;

  useEffect(() => {
    let live = true;
    const apply = (enabled: boolean) => {
      if (live) setReduceMotion(enabled);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", apply);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(accountRef.current ? -frame : 0);
  }, [frame, translateX]);

  useEffect(() => {
    if (pageHeight === 0) return;
    pager.current?.scrollTo({ x: indexRef.current * frame, animated: false });
  }, [frame, pageHeight]);

  const shift = (to: number) => {
    translateX.stopAnimation();
    if (reduceMotion) {
      translateX.setValue(to);
      return;
    }
    Animated.timing(translateX, {
      toValue: to,
      duration: SHIFT_MS,
      easing: SNAP,
      useNativeDriver: true,
    }).start();
  };

  const closeAccount = () => {
    if (!accountRef.current) return;
    accountRef.current = false;
    setAccount(false);
    shift(0);
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    const step = steps[indexRef.current];
    if (step)
      AccessibilityInfo.announceForAccessibility(
        `Step ${indexRef.current + 1} of ${steps.length}. ${step.title}`,
      );
  };
  const closeFromHardware = useEffectEvent(() => {
    closeAccount();
  });

  useEffect(() => {
    if (!account || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeFromHardware();
      return true;
    });
    return () => subscription.remove();
  }, [account]);

  const openAccount = () => {
    if (accountRef.current) return;
    accountRef.current = true;
    setAccount(true);
    shift(-frame);
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(copy.title);
  };

  const show = (next: number) => {
    indexRef.current = next;
    setIndex(next);
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    const step = steps[next];
    if (step)
      AccessibilityInfo.announceForAccessibility(
        `Step ${next + 1} of ${steps.length}. ${step.title}`,
      );
  };

  const go = (next: number) => {
    if (next < 0 || next >= steps.length || next === indexRef.current) return;
    show(next);
    pager.current?.scrollTo({ x: next * frame, animated: !reduceMotion });
  };

  const commit = (next: number | null) => {
    if (next === null || next === indexRef.current) return;
    show(next);
  };

  const onBody = (event: LayoutChangeEvent) => {
    const next = heightOf(event);
    setBodyHeight((height) => (height === next ? height : next));
  };
  const onPager = (event: LayoutChangeEvent) => {
    const next = heightOf(event);
    setPageHeight((height) => (height === next ? height : next));
  };

  return (
    <View className="flex-1 overflow-hidden bg-canvas" style={{ paddingTop: insets.top + 4 }}>
      <View className="flex-1" style={{ paddingHorizontal: Math.max(0, (width - frame) / 2) }}>
        <View className="flex-1">
          <View className="min-h-14 flex-row items-center justify-between px-6">
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              <BrandMark size={28} />
              <Text
                className="font-display text-2xl tracking-wide text-ink uppercase"
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                Color Up
              </Text>
            </View>
            {account ? (
              <Button
                label="Back"
                variant="ghost"
                size="sm"
                className="-mr-4"
                onPress={closeAccount}
              />
            ) : (
              <Button
                label="Skip"
                variant="ghost"
                size="sm"
                className="-mr-4"
                onPress={openAccount}
              />
            )}
          </View>
          <View className="flex-1 overflow-hidden" onLayout={onBody}>
            {bodyHeight > 0 ? (
              <Animated.View
                style={{
                  width: frame * 2,
                  height: bodyHeight,
                  flexDirection: "row",
                  transform: [{ translateX }],
                }}
              >
                <View
                  style={{ width: frame, height: bodyHeight }}
                  accessibilityElementsHidden={account}
                  importantForAccessibility={account ? "no-hide-descendants" : "auto"}
                  pointerEvents={account ? "none" : "auto"}
                >
                  <View className="flex-1" onLayout={onPager}>
                    {pageHeight > 0 ? (
                      <ScrollView
                        ref={pager}
                        horizontal
                        pagingEnabled
                        bounces={false}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        directionalLockEnabled
                        disableIntervalMomentum
                        decelerationRate="fast"
                        overScrollMode="never"
                        contentInsetAdjustmentBehavior="never"
                        scrollEnabled={!reduceMotion}
                        style={{ height: pageHeight, width: frame }}
                        contentContainerStyle={{ height: pageHeight }}
                        onScrollBeginDrag={() => {
                          dragging.current = true;
                        }}
                        onMomentumScrollEnd={(event) => {
                          const fromFinger = dragging.current;
                          dragging.current = false;
                          if (!fromFinger) return;
                          commit(pageOf(event));
                        }}
                        onScrollEndDrag={(event) => {
                          if (!dragging.current) return;
                          const velocity = event.nativeEvent.velocity?.x ?? 0;
                          if (Math.abs(velocity) > 0.05) return;
                          dragging.current = false;
                          commit(pageOf(event));
                        }}
                      >
                        {steps.map((step, i) => (
                          <View
                            key={step.title}
                            style={{ width: frame, height: pageHeight, overflow: "hidden" }}
                            accessibilityLabel={step.title}
                            accessibilityElementsHidden={i !== index}
                            importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
                          >
                            <View className="flex-1 justify-center overflow-hidden px-6">
                              {step.title === tripTitle && pageHeight >= TRIP_MIN_PAGE ? (
                                <View
                                  accessible
                                  accessibilityRole="image"
                                  accessibilityLabel={tripLabel}
                                  pointerEvents="none"
                                >
                                  <TripHero {...sampleTrip} />
                                </View>
                              ) : null}
                            </View>
                            <View className="gap-3 px-6 pb-2">
                              <DisplayTitle compact={compact}>{step.title}</DisplayTitle>
                              <StepBody>{step.body}</StepBody>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                  <View className="gap-2 px-6 pt-2" style={{ paddingBottom: insets.bottom + 16 }}>
                    <View className="flex-row items-center justify-center">
                      {steps.map((step, i) => (
                        <Pressable
                          key={step.title}
                          accessibilityRole="button"
                          accessibilityLabel={`${step.title}, step ${i + 1} of ${steps.length}`}
                          accessibilityState={{ selected: i === index }}
                          onPress={() => go(i)}
                          className="h-11 w-11 items-center justify-center active:opacity-60"
                        >
                          <View
                            className={cn(
                              "h-2 rounded-full",
                              i === index ? "w-6 bg-accent" : "w-2 bg-fill",
                            )}
                          />
                        </Pressable>
                      ))}
                    </View>
                    <Button
                      label={last ? "Get started" : "Continue"}
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onPress={() => (last ? openAccount() : go(index + 1))}
                    />
                  </View>
                </View>
                <View
                  style={{ width: frame, height: bodyHeight }}
                  accessibilityLabel={copy.title}
                  accessibilityElementsHidden={!account}
                  importantForAccessibility={account ? "auto" : "no-hide-descendants"}
                  pointerEvents={account ? "auto" : "none"}
                >
                  <View className="flex-1 justify-end gap-3 px-6 pb-2">
                    <DisplayTitle compact={compact}>{copy.title}</DisplayTitle>
                    <StepBody>{copy.body}</StepBody>
                  </View>
                  <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
                    <SignInButton mode="sign-up" label="Create an account" variant="primary" />
                    <SignInButton mode="sign-in" label="Sign in" variant="secondary" />
                    {onRecord ? (
                      <Button
                        label="Record without an account"
                        variant="ghost"
                        size="lg"
                        className="w-full"
                        onPress={onRecord}
                      />
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

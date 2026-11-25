import * as Haptics from "expo-haptics";
import { useEffect, useEffectEvent, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandWordmark } from "../components/BrandWordmark";
import { Button, IconButton } from "../components/ui/Button";
import { cn } from "../components/ui/cn";
import { Icon } from "../components/ui/Icon";
import { useScreenFoot } from "../components/ui/tabBar";
import { animate, ease, useReducedMotion } from "../components/ui/motion";
import { AppleSignInButton, useAppleSignInAvailable } from "./AppleSignInButton";
import { OnboardingChart } from "./OnboardingChart";
import { SignInButton } from "./SignInButton";

const SHIFT_MS = 250;

const FRAME = 440;

const APPLE_ROOM = 64;

const steps = [
  {
    chart: 0,
    title: "Keep the casino trip honest.",
    body: "Log buy-ins and cash-outs as you play. Color Up works out everyone's results and who owes whom. You pay each other however you like.",
  },
  {
    chart: 1,
    title: "Log it at the table.",
    body: "Buy-ins and cash-outs take a few taps. Reuse a recent rebuy amount, then confirm.",
  },
  {
    chart: 2,
    title: "Watch the board.",
    body: "Follow your trip result, session by session, and see where you stand.",
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
          ? "text-[31px] leading-[34px] font-extrabold tracking-[-0.7px] text-ink"
          : "text-[39px] leading-[42px] font-extrabold tracking-[-1px] text-ink"
      }
    >
      {children}
    </Text>
  );
}

function StepBody({ children }: { children: string }) {
  return (
    <Text className="type-body text-muted" numberOfLines={6} maxFontSizeMultiplier={1.35}>
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
  const { clearance } = useScreenFoot();
  const { width } = useWindowDimensions();
  const frame = Math.min(width, FRAME);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const [translateX] = useState(() => new Animated.Value(0));
  const indexRef = useRef(0);
  const dragging = useRef(false);
  const accountRef = useRef(invited);
  const [index, setIndex] = useState(0);
  const [account, setAccount] = useState(invited);
  const reduceMotion = useReducedMotion();
  const [bodyHeight, setBodyHeight] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const apple = useAppleSignInAvailable();
  const compact = bodyHeight > 0 && bodyHeight < 675;
  const accountRoom = apple ? APPLE_ROOM : 0;
  const accountCompact = bodyHeight > 0 && bodyHeight < 675 + accountRoom;
  const accountChartMin = apple ? 660 + APPLE_ROOM : 530;
  const last = index === steps.length - 1;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(accountRef.current ? -frame : 0);
  }, [frame, translateX]);

  useEffect(() => {
    if (pageHeight === 0) return;
    pager.current?.scrollTo({ x: indexRef.current * frame, animated: false });
  }, [frame, pageHeight]);

  const shift = (to: number) =>
    animate(translateX, { toValue: to, duration: SHIFT_MS, easing: ease.enter });

  const closeAccount = () => {
    if (!accountRef.current) return;
    accountRef.current = false;
    setAccount(false);
    shift(0);
    void Haptics.selectionAsync();
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
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(copy.title);
  };

  const show = (next: number) => {
    indexRef.current = next;
    setIndex(next);
    void Haptics.selectionAsync();
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
            <View accessible accessibilityLabel="Color Up">
              <BrandWordmark />
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
                            <View className={cn("px-6 pt-4", compact ? "gap-3" : "gap-5")}>
                              {pageHeight >= 360 ? (
                                <OnboardingChart page={step.chart} compact={compact} />
                              ) : null}
                              <View className="gap-2">
                                <DisplayTitle compact={compact}>{step.title}</DisplayTitle>
                                <StepBody>{step.body}</StepBody>
                              </View>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                  <View
                    className="flex-row items-center justify-between px-6 pt-2"
                    style={{ paddingBottom: clearance + 16 }}
                  >
                    <View className="-ml-2 flex-row items-center">
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
                              "rounded-full",
                              i === index ? "h-2 w-6 bg-ink" : "size-2 bg-fill",
                            )}
                          />
                        </Pressable>
                      ))}
                    </View>
                    {last ? (
                      <Button
                        label="Get Started"
                        variant="accent"
                        size="md"
                        onPress={openAccount}
                      />
                    ) : (
                      <IconButton
                        accessibilityLabel="Continue"
                        icon={<Icon name="arrow-right" color="ink" size={22} />}
                        onPress={() => go(index + 1)}
                      />
                    )}
                  </View>
                </View>
                <View
                  style={{ width: frame, height: bodyHeight }}
                  accessibilityLabel={copy.title}
                  accessibilityElementsHidden={!account}
                  importantForAccessibility={account ? "auto" : "no-hide-descendants"}
                  pointerEvents={account ? "auto" : "none"}
                >
                  <View className={cn("flex-1 gap-3 px-6 pb-2", invited ? "justify-end" : "pt-4")}>
                    {!invited && bodyHeight >= accountChartMin ? (
                      <OnboardingChart page={3} compact={accountCompact} />
                    ) : null}
                    <DisplayTitle compact={accountCompact}>{copy.title}</DisplayTitle>
                    <StepBody>{copy.body}</StepBody>
                  </View>
                  <View className="gap-3 px-6" style={{ paddingBottom: clearance + 16 }}>
                    <AppleSignInButton />
                    <SignInButton
                      mode="sign-up"
                      label="Create an account"
                      variant={apple ? "secondary" : "primary"}
                    />
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

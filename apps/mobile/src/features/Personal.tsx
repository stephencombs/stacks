import { useRecordingSync } from "@stacks/client-runtime/recordingReact";
import type { RecordingSyncLine } from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
} from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "../components/BrandMark";
import { BrandWordmark } from "../components/BrandWordmark";
import { Button } from "../components/ui/Button";
import { ControlSurface } from "../components/ui/ControlSurface";
import { PressableScale } from "../components/ui/PressableScale";
import { Icon, type IconName } from "../components/ui/Icon";
import { FloatingAction } from "../components/ui/FloatingAction";
import { PinnedFooter } from "../components/ui/PinnedFooter";
import { clampedScrollOffset } from "../components/ui/scrollClamp";
import { SheetHost } from "../components/ui/Sheet";
import { useScreenFoot } from "../components/ui/tabBar";
import { cn } from "../components/ui/cn";
import { useAccount } from "../lib/account";
import { FeltStatusBar } from "./FeltStatusBar";
import { PersonalLiveBar } from "./LiveBar";
import { useNativeHeaderActions } from "./NativeHeaderActions";
import { UserAvatar } from "./UserAvatar";
import { YouSheet } from "./You";

/**
 * A screen of your own play: it scrolls under the header, and its main actions sit in a dock
 * within thumb reach above the tab bar or the home indicator, stacked unless the caller puts them
 * in a row. It reads nothing from an account or the network. With `live`, your own live session
 * floats above the tab bar.
 */
export function PersonalScreen({
  children,
  dock,
  toast,
  fab,
  live = false,
  felt = false,
  session = false,
  headerActions = true,
  scrollRef,
  onScroll,
  contentClassName,
}: {
  children: ReactNode;
  dock?: ReactNode;
  toast?: ReactNode;
  /** A floating action button, bottom right above the live bar: the screen's main way to add. */
  fab?: ReactNode;
  live?: boolean;
  felt?: boolean;
  session?: boolean;
  /** Shows You in the iOS navigation bar. Off for a screen that puts something else there. */
  headerActions?: boolean;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  onScroll?: ScrollViewProps["onScroll"];
  contentClassName?: string;
}) {
  const header = useNativeHeaderActions({ disabled: session || !headerActions });
  const insets = useSafeAreaInsets();
  const foot = useScreenFoot({ footer: !!dock, fab: !!fab });
  const manualInset = session && Platform.OS === "ios";
  const fallbackScroll = useRef<ScrollViewInstance>(null);
  const scroll = scrollRef ?? fallbackScroll;

  const scrollState = useRef({
    offsetY: 0,
    layoutHeight: 0,
    scrolled: false,
  });

  const sides = {
    paddingLeft: Math.max(16, insets.left),
    paddingRight: Math.max(16, insets.right),
  };

  return (
    <SheetHost>
      <View
        className={felt ? "flex-1 bg-felt" : "flex-1 bg-canvas"}
        style={session ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <FeltStatusBar felt={felt} />
        <ScrollView
          ref={scroll}
          className={felt ? "flex-1" : "flex-1 bg-canvas"}
          style={foot.scrollStyle}
          contentInsetAdjustmentBehavior={manualInset ? "never" : "automatic"}
          keyboardShouldPersistTaps="handled"
          alwaysBounceVertical={!manualInset}
          scrollEventThrottle={32}
          onLayout={
            manualInset
              ? (event) => {
                  scrollState.current.layoutHeight = event.nativeEvent.layout.height;
                }
              : undefined
          }
          onScroll={
            manualInset || onScroll
              ? (event) => {
                  if (manualInset) {
                    const { contentOffset, layoutMeasurement } = event.nativeEvent;
                    scrollState.current.offsetY = contentOffset.y;
                    scrollState.current.layoutHeight = layoutMeasurement.height;
                    scrollState.current.scrolled = true;
                  }

                  onScroll?.(event);
                }
              : undefined
          }
          onContentSizeChange={
            manualInset
              ? (_width, height) => {
                  const next = clampedScrollOffset(scrollState.current, height);

                  if (next !== null) {
                    scrollState.current.offsetY = next;
                    scroll.current?.scrollTo({ y: next, animated: true });
                  }
                }
              : undefined
          }
          contentContainerClassName={cn("gap-6", !manualInset && "pt-4", contentClassName)}
          contentContainerStyle={{
            ...sides,
            paddingBottom: foot.endSpace + 16,
            ...(session ? { flexGrow: 1, paddingTop: 12 } : null),
          }}
        >
          {children}
        </ScrollView>
        {fab ? (
          <FloatingAction right={sides.paddingRight} bottom={foot.fabBottom}>
            {fab}
          </FloatingAction>
        ) : null}
        {dock ? (
          <PinnedFooter
            felt={felt}
            sides={sides}
            onLayout={foot.onFooterLayout}
            inset={foot.footerInset}
          >
            {dock}
          </PinnedFooter>
        ) : null}
        {toast ? (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: sides.paddingLeft,
              right: sides.paddingRight,
              bottom: (foot.above ?? Math.max(insets.bottom, 12)) + 8,
            }}
          >
            {toast}
          </View>
        ) : null}
        {live ? (
          <PersonalLiveBar
            onHeightChange={foot.onLiveBarHeight}
            {...(foot.above === undefined ? {} : { bottom: foot.above })}
          />
        ) : null}
      </View>
    </SheetHost>
  );
}

type Status = "loading" | "saved" | "saving" | "save_failed" | "load_failed" | "closed";

/**
 * Whether what's on screen is saved, in words. Only a finished write to this device reads as
 * saved, and only the account's confirmation reads as synced. Changes the account refused
 * follow, each with a way to record it again or let it go. Pass `visitId` on a session.
 */
export function SaveStatus({
  status,
  error,
  onRetry,
  visitId,
  felt = false,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  visitId?: VisitId;
  felt?: boolean;
}) {
  const sync = useRecordingSync(visitId);

  if (
    status !== "saved" ||
    (sync.rejected.length === 0 && sync.error === null && sync.claim.length === 0 && !sync.canLink)
  )
    return (
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} felt={felt} />
    );

  return (
    <View className="gap-2">
      <SaveLine status={status} error={error} onRetry={onRetry} sync={sync.line} felt={felt} />
      {sync.canLink ? (
        <View className="gap-3 rounded-lg bg-fill px-3 py-2.5">
          <Text className="text-sm text-muted">
            Link them to your account to keep them there. They stay separate players, and nothing is
            merged.
          </Text>
          <View className="flex-row justify-end">
            <Button label="Link to my account" size="sm" onPress={sync.link} />
          </View>
        </View>
      ) : null}
      {sync.claim.map((line) => (
        <View
          key={line.kind}
          accessibilityRole={line.kind === "refused" ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          className={cn(
            "gap-3 rounded-lg bg-fill px-3 py-2.5",
            Platform.OS === "android" && "flex-row items-center",
          )}
        >
          <View className={cn("min-w-0 flex-row gap-2", Platform.OS === "android" && "flex-1")}>
            <Icon
              name={line.kind === "refused" ? "alert" : "cloud-check"}
              color={line.kind === "refused" ? "loss" : "muted"}
              size={16}
            />
            <Text
              selectable
              className={cn("flex-1 text-sm", line.kind === "refused" ? "text-loss" : "text-muted")}
            >
              {line.text}
            </Text>
          </View>
          <View className="flex-row justify-end">
            <Button label="Dismiss" size="sm" onPress={sync.dismissClaim} />
          </View>
        </View>
      ))}
      {sync.rejected.map((item) => (
        <View
          key={item.operationId}
          accessibilityRole="alert"
          className="gap-3 rounded-lg bg-fill px-3 py-2.5"
        >
          <View className="min-w-0 flex-row gap-2">
            <Icon name="alert" color="loss" size={16} />
            <Text selectable className="flex-1 text-sm text-loss">
              {item.sentence}
            </Text>
          </View>
          <View className="flex-row justify-end gap-2">
            <Button label="Discard" size="sm" onPress={() => void sync.discard(item.operationId)} />
            <Button
              label="Record again"
              size="sm"
              onPress={() => void sync.recordAgain(item.operationId)}
            />
          </View>
        </View>
      ))}
      {sync.error ? <Text className="text-sm text-loss">{sync.error}</Text> : null}
    </View>
  );
}

const syncIcons: Record<RecordingSyncLine["kind"], IconName> = {
  device: "check",
  syncing: "cloud-upload",
  waiting: "cloud-upload",
  synced: "cloud-check",
  blocked: "cloud-off",
};

function SaveLine({
  status,
  error,
  onRetry,
  sync,
  felt = false,
}: {
  status: Status;
  error: string | null;
  onRetry: () => void;
  sync: RecordingSyncLine;
  felt?: boolean;
}) {
  if (status === "load_failed")
    return (
      <View
        accessibilityRole="alert"
        className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg bg-fill px-3 py-2.5"
      >
        <View className="min-w-0 flex-1 flex-row gap-2">
          <Icon name="alert" color="loss" size={16} />
          <Text selectable className="flex-1 text-sm text-loss">
            {error}
          </Text>
        </View>
        <Button label="Try again" size="sm" onPress={onRetry} />
      </View>
    );
  const busy = status === "loading" || status === "saving" || sync.kind === "syncing";
  const failed = status === "save_failed";

  if (!busy && !failed && (sync.kind === "device" || sync.kind === "synced"))
    return felt && Platform.OS === "android" ? (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="min-h-5 flex-row items-center"
      >
        <Text className="text-sm opacity-0">Syncing…</Text>
      </View>
    ) : null;

  const text =
    status === "loading"
      ? "Opening…"
      : status === "saving"
        ? "Saving…"
        : failed
          ? "Last change not saved"
          : sync.text;

  return (
    <View accessibilityLiveRegion="polite" className="min-h-5 flex-row items-center gap-1.5">
      {busy ? (
        <ActivityIndicator
          size="small"
          colorClassName={felt ? "accent-felt-soft" : "accent-muted"}
        />
      ) : (
        <Icon
          name={failed ? "alert" : syncIcons[sync.kind]}
          color={failed ? "loss" : felt ? "felt-soft" : "muted"}
          size={14}
        />
      )}
      <Text
        className={cn("text-sm", failed ? "text-loss" : felt ? "text-felt-soft" : "text-muted")}
      >
        {text}
      </Text>
    </View>
  );
}

/** You, top right of your own play's screens, for anyone signed in or not. */
export function PersonalYouButton() {
  const [open, setOpen] = useState(false);
  const account = useAccount();

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="You"
        accessibilityHint="Your sessions, appearance and account"
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="size-11 items-center justify-center"
      >
        {Platform.OS === "android" && account.available && account.isSignedIn ? (
          <UserAvatar size={32} />
        ) : (
          <ControlSurface>
            {account.available && account.isSignedIn ? (
              <UserAvatar size={32} ring={false} />
            ) : (
              <Icon name="person" color="ink" size={20} />
            )}
          </ControlSurface>
        )}
      </PressableScale>
      <YouSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Color Up's mark and name, top left of Play. */
export function PlayBrand() {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Color Up"
      className={cn("flex-row items-center gap-2.5", Platform.OS === "ios" && "h-11")}
    >
      {Platform.OS === "android" ? (
        <>
          <BrandMark size={30} />
          <Text className="type-title text-ink">Color Up</Text>
        </>
      ) : (
        <BrandWordmark />
      )}
    </View>
  );
}

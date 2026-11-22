import { Circle, HStack, Link, Overlay, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  activityBackgroundTint,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  hidden,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  privacySensitive,
  shapes,
  strokeBorder,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

import design from "../../../../docs/design/tokens.json";

const color = (name: string, theme: "light" | "dark") =>
  design.color.tokens.find((token) => token.name === name)!.value[theme];

export const sessionActivityColors = {
  ink: color("ink-inverse", "light"),
  inverse: color("ink-inverse", "dark"),
  muted: color("muted", "dark"),
  chip: color("chip-black", "light"),
  chipRing: color("muted", "dark"),
  live: color("live-text", "dark"),
  loss: color("loss", "dark"),
  darkCard: color("ground", "dark"),
  darkSecondary: color("ink", "light"),
  darkPrimary: color("card", "dark"),
  lightSecondary: color("fill-strong", "dark"),
};

export type SessionActivityContent = {
  gameLabel: string;
  colors: typeof sessionActivityColors;
  colorScheme: "light" | "dark" | null;
} & (
  | {
      kind: "live";
      venueLabel: string;
      buyInText: string;
      startedAtMs: number;
      openUrl: string;
      cashOutUrl: string;
    }
  | {
      kind: "finished";
      finishedTimeText: string;
      resultText: string;
      resultTone: "win" | "loss" | "neutral";
      durationText: string;
      buyInText: string;
      cashOutText: string;
      hourlyText: string;
      seeSessionUrl: string;
    }
);

export const sessionActivity = createLiveActivity(
  "ColorUpSession",
  (content: SessionActivityContent, environment: LiveActivityEnvironment) => {
    "widget";

    const { colors } = content;
    const dark = (content.colorScheme ?? environment.colorScheme) === "dark";

    const label = [
      font({ size: 15, weight: "semibold" }),
      foregroundStyle(colors.ink),
      lineLimit(1),
    ];

    const secondary = [font({ size: 13 }), foregroundStyle(colors.muted), lineLimit(1)];

    const chip = (size: number) => (
      <ZStack modifiers={[accessibilityHidden()]}>
        <Circle modifiers={[foregroundStyle(colors.chip), frame({ width: size, height: size })]} />
        <Circle
          modifiers={[
            foregroundStyle(colors.chip),
            strokeBorder({
              content: colors.ink,
              style: { lineWidth: size * 0.13, dash: [size * 0.15, size * 0.13] },
              shape: "circle",
            }),
            frame({ width: size * 0.87, height: size * 0.87 }),
          ]}
        />
        <Circle
          modifiers={[
            foregroundStyle(colors.chip),
            strokeBorder({ content: colors.chipRing, style: { lineWidth: 1 }, shape: "circle" }),
            frame({ width: size * 0.47, height: size * 0.47 }),
          ]}
        />
      </ZStack>
    );

    const action = (title: string, url: string, primary = false) => (
      <Link destination={url} modifiers={[buttonStyle("plain")]}>
        <Text
          modifiers={[
            font({ size: 14, weight: "semibold" }),
            lineLimit(1),
            minimumScaleFactor(0.75),
            foregroundStyle(primary && !dark ? colors.inverse : colors.ink),
            frame({ maxWidth: 400 }),
            frame({ height: 40 }),
            background(
              primary
                ? dark
                  ? colors.darkPrimary
                  : colors.ink
                : dark
                  ? colors.darkSecondary
                  : colors.lightSecondary,
              shapes.capsule(),
            ),
          ]}
        >
          {title}
        </Text>
      </Link>
    );

    const bannerModifiers = [
      padding({ all: 14 }),
      activityBackgroundTint(dark ? colors.darkCard : null),
    ];

    const subtitle = content.kind === "live" ? content.venueLabel : content.finishedTimeText;

    const identityText = (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={label}>{content.gameLabel}</Text>
        <Text modifiers={secondary}>{subtitle}</Text>
      </VStack>
    );

    const identity = (
      <HStack spacing={10}>
        {chip(36)}
        {identityText}
      </HStack>
    );

    const amount = [
      font({ size: 27, weight: "bold" }),
      monospacedDigit(),
      privacySensitive(),
      lineLimit(1),
      minimumScaleFactor(0.7),
    ];

    if (content.kind === "finished") {
      const color =
        content.resultTone === "win"
          ? colors.live
          : content.resultTone === "loss"
            ? colors.loss
            : colors.ink;

      const summaryStyle = [
        font({ size: 14, weight: "medium" }),
        foregroundStyle(colors.ink),
        lineLimit(1),
        monospacedDigit(),
      ];

      return {
        banner: (
          <VStack alignment="leading" spacing={12} modifiers={bannerModifiers}>
            <HStack spacing={8}>
              {identity}
              <Spacer />
              <VStack alignment="trailing" spacing={2}>
                <Text modifiers={[...amount, foregroundStyle(color)]}>{content.resultText}</Text>
                <Text modifiers={secondary}>{content.durationText}</Text>
              </VStack>
            </HStack>
            <HStack spacing={12} modifiers={[privacySensitive()]}>
              <Text modifiers={summaryStyle}>{content.buyInText} in</Text>
              <Text modifiers={summaryStyle}>{content.cashOutText} out</Text>
              {content.hourlyText ? (
                <>
                  <Spacer />
                  <Text modifiers={summaryStyle}>{content.hourlyText}</Text>
                </>
              ) : null}
            </HStack>
            {action("See session", content.seeSessionUrl)}
          </VStack>
        ),
      };
    }

    const startedAt = new Date(content.startedAtMs);

    const timerStyle = [
      monospacedDigit(),
      foregroundStyle(colors.live),
      lineLimit(1),
      minimumScaleFactor(0.75),
    ];

    const liveTimer = (
      <Text
        modifiers={[
          font({ size: 13, weight: "semibold" }),
          ...timerStyle,
          multilineTextAlignment("trailing"),
          frame({ maxWidth: 118, alignment: "trailing" }),
        ]}
      >
        {"• Live "}
        <Text date={startedAt} dateStyle="timer" />
      </Text>
    );

    const details = (
      <HStack spacing={8}>
        {identity}
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[...amount, foregroundStyle(colors.ink)]}>{content.buyInText}</Text>
          {liveTimer}
        </VStack>
      </HStack>
    );

    return {
      banner: (
        <VStack spacing={12} modifiers={bannerModifiers}>
          {details}
          <HStack spacing={7}>
            {action("+ $100", content.openUrl)}
            {action("+ $200", content.openUrl)}
            {action("Cash out", content.cashOutUrl, true)}
          </HStack>
        </VStack>
      ),
      compactLeading: chip(20),
      compactTrailing: (
        <Overlay alignment="trailing" modifiers={[font({ size: 11, weight: "semibold" })]}>
          <Text modifiers={[...timerStyle, hidden()]}>0000:00:00</Text>
          <Overlay.Content>
            <Text
              date={startedAt}
              dateStyle="timer"
              modifiers={[...timerStyle, multilineTextAlignment("trailing")]}
            />
          </Overlay.Content>
        </Overlay>
      ),
      minimal: chip(20),
      expandedLeading: <HStack modifiers={[padding({ leading: 8 })]}>{chip(27)}</HStack>,
      expandedTrailing: (
        <Text
          modifiers={[
            font({ size: 17, weight: "bold" }),
            foregroundStyle(colors.ink),
            monospacedDigit(),
            privacySensitive(),
            lineLimit(1),
            minimumScaleFactor(0.65),
            padding({ trailing: 8 }),
          ]}
        >
          {content.buyInText}
        </Text>
      ),
      expandedBottom: (
        <HStack spacing={8} modifiers={[padding({ horizontal: 10, bottom: 4 })]}>
          {identityText}
          <Spacer />
          {liveTimer}
        </HStack>
      ),
    };
  },
);

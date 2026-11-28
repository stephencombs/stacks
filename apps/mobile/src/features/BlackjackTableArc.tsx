import { shortName } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import type { PlayerId, VisitId } from "@stacks/contracts";
import { Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Text } from "../components/ui/Text";
import { useReducedMotion } from "../components/ui/motion";
import { useLargeText } from "../lib/useLargeText";
import { PlayerAvatar } from "./PlayerAvatar";

export type ArcOccupant = {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly isSelf?: boolean;
  readonly visitId?: VisitId;
};

const HIT_TARGET = 44;
const HALF_HIT = HIT_TARGET / 2;
const AVATAR_SIZE = 30;

export const blackjackArcGeometry = (
  seats: number,
  rawWidth: number,
  { compact = false, largeText = false }: { compact?: boolean; largeText?: boolean } = {},
) => {
  const count = Math.max(2, seats);
  const width = Math.max(240, rawWidth);
  const cx = width / 2;
  const railY = 3;
  const cy = 62;
  const outerRx = cx - 32;
  const outerRy = compact ? 84 : 91;
  const height = cy + outerRy + (largeText ? 62 : 55);
  const spacing = Math.max(HIT_TARGET, (outerRx * 2) / (count - 1));

  const positions = Array.from({ length: count }, (_, index) => {
    const across = 1 - (2 * index) / (count - 1);
    const x = cx + ((count - 1) / 2 - index) * spacing;

    return {
      seat: index + 1,
      x: Math.round(Math.max(26, Math.min(width - 26, x))),
      y: Math.round(cy + outerRy * Math.sqrt(1 - across * across)),
    };
  });

  return { width, height, cx, cy, railY, outerRx, outerRy, positions };
};

const seatAccessibilityLabel = (
  seat: number,
  totalSeats: number,
  occupant: ArcOccupant | undefined,
  selected: boolean,
) => {
  const base = seatLabel(seat, totalSeats);

  if (occupant)
    return selected
      ? `${base}, occupied by ${occupant.name}, selected`
      : `${base}, occupied by ${occupant.name}`;

  return selected ? `${base}, selected` : `${base}, open`;
};

const useFeltColors = () => {
  const [felt = "", rail = "", ink = "", soft = ""] = useCSSVariable([
    "--color-felt",
    "--color-felt-deep",
    "--color-felt-ink",
    "--color-felt-soft",
  ]).map(String);

  return { felt, rail, ink, soft };
};

type FeltColors = ReturnType<typeof useFeltColors>;

function BlackjackTableArt({
  geometry,
  colors,
  selectedSeat,
  occupants,
  disabled,
}: {
  geometry: ReturnType<typeof blackjackArcGeometry>;
  colors: FeltColors;
  selectedSeat: number | null;
  occupants: ReadonlyMap<number, ArcOccupant> | undefined;
  disabled: boolean;
}) {
  const { width, height, cx, cy, railY, positions } = geometry;
  const bettingLineRadius = geometry.outerRx - 28;
  const dealerTop = railY + 14;

  const outline = (inset: number) => {
    const left = inset + 1;
    const right = width - left;
    const top = railY + inset;
    const bottom = height - 5 - inset;
    const corner = Math.max(4, 14 - inset);
    const curve = (right - cx) * 0.63;

    return `M ${left + corner} ${top} H ${right - corner} Q ${right} ${top} ${right} ${top + corner} V ${cy - 2} C ${right} ${bottom - 56} ${cx + curve} ${bottom} ${cx} ${bottom} S ${left} ${bottom - 56} ${left} ${cy - 2} V ${top + corner} Q ${left} ${top} ${left + corner} ${top} Z`;
  };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0"
    >
      <Svg width={width} height={height}>
        <Path d={outline(0)} fill={colors.rail} />
        <Path d={outline(7)} fill={colors.felt} />
        <Path
          d={`M ${cx - bettingLineRadius} ${cy - 4} Q ${cx} ${cy + geometry.outerRy + 10} ${cx + bettingLineRadius} ${cy - 4}`}
          fill="none"
          stroke={colors.soft}
          strokeOpacity={0.46}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
        <Path
          d={`M ${cx - 38} ${dealerTop} v 13 q 0 11 11 11 h 54 q 11 0 11 -11 v -13`}
          fill="none"
          stroke={colors.soft}
          strokeOpacity={0.46}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
        <SvgText
          x={cx}
          y={railY + 32}
          fill={colors.soft}
          fontSize={12}
          fontWeight="600"
          letterSpacing={0.4}
          textAnchor="middle"
        >
          Dealer
        </SvgText>
        {positions.map(({ seat, x, y }) => {
          const selected = seat === selectedSeat;
          const occupied = occupants?.has(seat);

          return (
            <G key={seat} x={x} y={y} opacity={disabled ? 0.6 : 1}>
              {occupied ? (
                selected ? (
                  <Circle r={18} fill="none" stroke={colors.ink} strokeWidth={2} />
                ) : null
              ) : (
                <Circle
                  r={17}
                  fill={selected ? colors.ink : "none"}
                  stroke={selected ? colors.ink : colors.soft}
                  strokeOpacity={selected ? 1 : 0.6}
                  strokeWidth={1.5}
                />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function SeatCaption({
  label,
  left,
  top,
  width,
  height,
}: {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left, top, width, alignItems: "center" }}
    >
      <View
        className="justify-center rounded-full bg-felt-deep px-2"
        style={{ maxWidth: width, height }}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          className="text-[11px] leading-[14px] font-semibold text-felt-ink"
          style={{ includeFontPadding: false }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export function BlackjackTableArc({
  seats,
  surface,
  selectedSeat = null,
  occupants,
  disabled = false,
  compact = false,
  onSelectSpot,
}: {
  seats: number;
  surface: "felt" | "sheet";
  selectedSeat?: number | null | undefined;
  occupants?: ReadonlyMap<number, ArcOccupant> | undefined;
  disabled?: boolean;
  compact?: boolean;
  onSelectSpot?: ((seat: number) => void) | undefined;
}) {
  const [width, setWidth] = useState(328);
  const largeText = useLargeText();
  const reducedMotion = useReducedMotion();
  const colors = useFeltColors();
  const geometry = blackjackArcGeometry(seats, width, { compact, largeText });
  const captionHeight = largeText ? 24 : 20;

  const spotSpacing = Math.max(
    HIT_TARGET,
    (geometry.outerRx * 2) / (geometry.positions.length - 1),
  );

  const spots = geometry.positions.map((position) => {
    const { seat, x, y } = position;

    const sharesCaptionRow = geometry.positions.some(
      (neighbor) =>
        neighbor.seat !== seat &&
        occupants?.has(neighbor.seat) &&
        Math.abs(y - neighbor.y) < captionHeight + 2 &&
        Math.abs(x - neighbor.x) < 68,
    );

    const nameWidth = sharesCaptionRow ? Math.min(68, spotSpacing - 2) : 68;
    const nameLeft = Math.max(1, Math.min(geometry.width - nameWidth - 1, x - nameWidth / 2));
    const occupant = occupants?.get(seat);

    return { seat, x, y, nameLeft, nameWidth, occupant };
  });

  return (
    <View
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);

        if (next > 0 && next !== width) setWidth(next);
      }}
      style={{ height: geometry.height }}
      className={
        surface === "felt" ? "relative w-full rounded-2xl bg-felt-deep/40" : "relative w-full"
      }
    >
      <BlackjackTableArt
        geometry={geometry}
        colors={colors}
        selectedSeat={selectedSeat}
        occupants={occupants}
        disabled={disabled}
      />

      {spots.map(({ seat, x, y, nameLeft, nameWidth, occupant }) => {
        const selected = seat === selectedSeat;
        const accessibilityLabel = seatAccessibilityLabel(seat, seats, occupant, selected);

        const style = {
          position: "absolute" as const,
          left: x - HALF_HIT,
          top: y - HALF_HIT,
          width: HIT_TARGET,
          height: HIT_TARGET,
        };

        const badge = occupant ? (
          <PlayerAvatar
            playerId={occupant.playerId}
            name={occupant.name}
            size={AVATAR_SIZE}
            you={Boolean(occupant.isSelf)}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={1.6}
            className="font-semibold tabular-nums"
            style={{
              color: selected ? colors.felt : colors.ink,
              fontSize: 15,
              includeFontPadding: false,
            }}
          >
            {seat}
          </Text>
        );

        return (
          <Fragment key={seat}>
            {onSelectSpot ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onSelectSpot(seat)}
                style={style}
                className={
                  reducedMotion
                    ? "items-center justify-center"
                    : "items-center justify-center active:opacity-75"
                }
              >
                {badge}
              </Pressable>
            ) : (
              <View
                accessible
                accessibilityLabel={accessibilityLabel}
                style={style}
                className="items-center justify-center"
              >
                {badge}
              </View>
            )}
            {occupant ? (
              <SeatCaption
                label={occupant.isSelf ? "You" : shortName(occupant.name)}
                left={nameLeft}
                top={y + HALF_HIT - 2}
                width={nameWidth}
                height={captionHeight}
              />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

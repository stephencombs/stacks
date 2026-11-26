import { shortName } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import type { PlayerId, VisitId } from "@stacks/contracts";
import { Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { useReducedMotion } from "../components/ui/motion";
import { Text } from "../components/ui/Text";
import { cn } from "../components/ui/cn";
import { useLargeText } from "../lib/useLargeText";
import { PlayerAvatar } from "./PlayerAvatar";

export type ArcOccupant = {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly isSelf?: boolean;
  readonly visitId?: VisitId;
};

type ArcSpotPosition = {
  readonly seat: number;
  readonly x: number;
  readonly y: number;
};

type BlackjackArcGeometry = {
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
  readonly railY: number;
  readonly outerRx: number;
  readonly outerRy: number;
  readonly innerRx: number;
  readonly innerRy: number;
  readonly positions: ReadonlyArray<ArcSpotPosition>;
};

const START_ANGLE = (14 * Math.PI) / 180;
const HIT_TARGET = 44;
const AVATAR_SIZE = 30;

/**
 * Computes semicircular blackjack spot coordinates ordered right-to-left (`Seat 1` on the right =
 * dealer's left; `Seat N` on the left = dealer's right) with non-overlapping 44pt targets.
 */
export const blackjackArcGeometry = (
  seats: number,
  rawWidth: number,
  { compact = false, largeText = false }: { compact?: boolean; largeText?: boolean } = {},
) => {
  const count = Math.max(2, seats);
  const width = Math.max(240, rawWidth);
  const railY = compact ? 20 : 24;
  const cy = railY + (compact ? 6 : 10);
  const cx = width / 2;
  const outerRx = width / 2 - 28;
  const outerRy = compact ? Math.round(width * 0.31) : Math.round(width * 0.35);
  const innerRx = Math.round(outerRx * 0.64);
  const innerRy = Math.round(outerRy * 0.64);
  const height = Math.round(cy + outerRy + 26 + (largeText ? 18 : 14));

  const positions = Array.from({ length: count }, (_, index) => {
    const seat = index + 1;
    const t = index / (count - 1);
    const angle = START_ANGLE + t * (Math.PI - 2 * START_ANGLE);

    return {
      seat,
      x: Math.round(cx + outerRx * Math.cos(angle)),
      y: Math.round(cy + outerRy * Math.sin(angle)),
    };
  });

  return {
    width,
    height,
    cx,
    cy,
    railY,
    outerRx,
    outerRy,
    innerRx,
    innerRy,
    positions,
  } satisfies BlackjackArcGeometry;
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

/**
 * 2D semicircular blackjack table arc with a top DEALER rail and 5-7 spots ordered right-to-left
 * (`Seat 1` / First base on the right, `Seat N` / Third base on the left). Works interactively on
 * felt or light/dark sheets, and read-only when `onSelectSpot` is omitted.
 */
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

  const tokens = useCSSVariable([
    "--color-felt",
    "--color-felt-deep",
    "--color-felt-ink",
    "--color-felt-soft",
    "--color-line",
  ]);

  const token = (index: number) => (tokens[index] ? String(tokens[index]) : undefined);
  const felt = token(0);
  const feltDeep = token(1);
  const feltInk = token(2);
  const feltSoft = token(3);
  const line = token(4);

  const geometry = blackjackArcGeometry(seats, width, { compact, largeText });
  const halfHit = HIT_TARGET / 2;

  const railLeft = geometry.cx - geometry.outerRx;
  const railRight = geometry.cx + geometry.outerRx;
  const betLeft = geometry.cx - geometry.innerRx;
  const betRight = geometry.cx + geometry.innerRx;

  const outerPath = `M ${railLeft} ${geometry.railY} L ${railRight} ${geometry.railY} L ${railRight} ${geometry.cy} A ${geometry.outerRx} ${geometry.outerRy} 0 0 1 ${railLeft} ${geometry.cy} Z`;
  const innerFeltArc = `M ${betLeft} ${geometry.cy} A ${geometry.innerRx} ${geometry.innerRy} 0 0 0 ${betRight} ${geometry.cy}`;

  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);

        if (next > 0 && Math.abs(next - width) > 2) setWidth(next);
      }}
      style={{ height: geometry.height }}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl",
        surface === "sheet" ? "bg-felt-deep" : "bg-felt-deep/40",
      )}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-0"
      >
        <Svg width={geometry.width} height={geometry.height}>
          {surface === "sheet" ? (
            <Path d={outerPath} fill={felt} stroke={line} strokeWidth={1} />
          ) : (
            <>
              <Path d={outerPath} fill={feltDeep} fillOpacity={0.5} />
              <Line
                x1={railLeft}
                y1={geometry.railY}
                x2={railRight}
                y2={geometry.railY}
                stroke={feltSoft}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            </>
          )}
          <Path
            d={innerFeltArc}
            fill="none"
            stroke={feltInk}
            strokeOpacity={0.22}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <SvgText
            x={geometry.cx}
            y={geometry.railY - 5}
            fill={feltSoft}
            fontSize={9}
            fontWeight="600"
            letterSpacing={1.4}
            textAnchor="middle"
          >
            DEALER
          </SvgText>
          <SvgText
            x={railRight - 14}
            y={geometry.railY + 14}
            fill={feltSoft}
            fillOpacity={0.75}
            fontSize={8}
            fontWeight="600"
            textAnchor="end"
          >
            1ST
          </SvgText>
          <SvgText
            x={railLeft + 14}
            y={geometry.railY + 14}
            fill={feltSoft}
            fillOpacity={0.75}
            fontSize={8}
            fontWeight="600"
            textAnchor="start"
          >
            3RD
          </SvgText>
        </Svg>
      </View>

      {geometry.positions.map((pos) => {
        const occupant = occupants?.get(pos.seat);
        const selected = selectedSeat === pos.seat;
        const a11yLabel = seatAccessibilityLabel(pos.seat, seats, occupant, selected);

        const badge = occupant ? (
          <View
            className={cn(
              "size-9 items-center justify-center rounded-full",
              selected
                ? "border-2 border-felt-ink bg-felt"
                : "border border-felt-ink/50 bg-felt-deep",
            )}
          >
            <PlayerAvatar
              playerId={occupant.playerId}
              name={occupant.name}
              size={AVATAR_SIZE}
              you={Boolean(occupant.isSelf)}
            />
          </View>
        ) : (
          <View
            className={cn(
              "size-9 items-center justify-center rounded-full border",
              selected ? "border-2 border-felt-ink bg-felt-ink" : "border-felt-ink/45 bg-felt-deep",
            )}
          >
            <Text
              className={cn(
                "type-callout font-bold tabular-nums",
                selected ? "text-felt-deep" : "text-felt-ink",
              )}
            >
              {pos.seat}
            </Text>
          </View>
        );

        const caption = occupant ? (
          <View className="mt-0.5 max-w-16 rounded-full bg-felt-deep/90 px-1.5 py-0.5">
            <Text
              numberOfLines={1}
              className="text-[10px] leading-[12px] font-medium text-felt-ink"
            >
              {occupant.isSelf ? "You" : shortName(occupant.name)}
            </Text>
          </View>
        ) : selected ? (
          <View className="mt-0.5 rounded-full bg-felt-deep/90 px-1.5 py-0.5">
            <Text className="text-[10px] leading-[12px] font-semibold text-felt-ink">Selected</Text>
          </View>
        ) : null;

        const left = pos.x - halfHit;
        const top = pos.y - halfHit;
        const captionLeft = Math.max(0, Math.min(geometry.width - 68, pos.x - 34));

        const spotControl = !onSelectSpot ? (
          <View
            accessibilityLabel={a11yLabel}
            style={{ position: "absolute", left, top, width: HIT_TARGET, height: HIT_TARGET }}
            className="items-center justify-center"
          >
            {badge}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            disabled={disabled}
            hitSlop={4}
            onPress={() => onSelectSpot(pos.seat)}
            style={{ position: "absolute", left, top, width: HIT_TARGET, height: HIT_TARGET }}
            className={cn(
              "items-center justify-center",
              disabled && "opacity-60",
              !reducedMotion && "active:opacity-80",
            )}
          >
            {badge}
          </Pressable>
        );

        return (
          <Fragment key={pos.seat}>
            {spotControl}
            {caption ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: "absolute",
                  left: captionLeft,
                  top: pos.y + 19,
                  width: 68,
                  alignItems: "center",
                }}
              >
                {caption}
              </View>
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

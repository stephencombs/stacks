import { shortName } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import type { PlayerId, VisitId } from "@stacks/contracts";
import { Fragment, useId, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

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
const IVORY = "#fff1ce";
const PRINT_GOLD = "#dfc990";

export const blackjackArcGeometry = (
  seats: number,
  rawWidth: number,
  { compact = false, largeText = false }: { compact?: boolean; largeText?: boolean } = {},
) => {
  const count = Math.max(2, seats);
  const width = Math.max(240, rawWidth);
  const cx = width / 2;
  const railY = 3;
  const cy = 87;
  const outerRx = cx - 32;
  const outerRy = compact ? 84 : 91;
  const innerRx = Math.min(108, cx - 58);
  const innerRy = 21;
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

  return { width, height, cx, cy, railY, outerRx, outerRy, innerRx, innerRy, positions };
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

const chipStacks = [
  { x: -45, face: "#9b342d", edge: "#f2b69c" },
  { x: -22, face: "#32734e", edge: "#b9d6a1" },
  { x: 1, face: "#2b3137", edge: "#bdc9c8" },
  { x: 24, face: "#62385e", edge: "#dcb6d8" },
];

function DealerStation({ cx, hardware }: { cx: number; hardware: string }) {
  return (
    <>
      <G x={cx}>
        <Rect x={-54} y={20} width={108} height={29} rx={5} fill="#04130d" opacity={0.65} />
        <Rect x={-53} y={16} width={106} height={29} rx={5} fill={hardware} stroke="#927958" />
        <Rect x={-48} y={19} width={96} height={23} rx={3} fill="#0e1210" />
        {chipStacks.map(({ x, face, edge }) => (
          <G key={x} x={x}>
            <Rect y={21} width={21} height={19} rx={3} fill={face} />
            {[3, 6, 9, 12, 15, 18].map((chip) => (
              <Line
                key={chip}
                x1={chip}
                x2={chip}
                y1={22}
                y2={39}
                stroke={edge}
                strokeOpacity={0.48}
                strokeWidth={0.75}
                strokeDasharray="4 2 2 2"
              />
            ))}
            <Line x1={2} x2={19} y1={22.5} y2={22.5} stroke={edge} strokeOpacity={0.45} />
            <Line x1={2} x2={19} y1={38.5} y2={38.5} stroke="#0d0e0c" strokeOpacity={0.6} />
          </G>
        ))}
        <Rect x={-29} y={51} width={58} height={17} rx={4} fill="#11251c" stroke="#9f8557" />
        <Circle cx={-23} cy={59.5} r={1} fill="#ae9564" />
        <Circle cx={23} cy={59.5} r={1} fill="#ae9564" />
        <SvgText
          y={62.5}
          fill={IVORY}
          fontSize={8}
          fontWeight="700"
          letterSpacing={1.2}
          textAnchor="middle"
        >
          DEALER
        </SvgText>
      </G>

      <G x={cx - 83} y={36} rotation={-13}>
        <Rect x={-16} y={-11} width={31} height={28} rx={4} fill="#051710" opacity={0.7} />
        <Rect x={-17} y={-14} width={31} height={28} rx={4} fill={hardware} stroke="#857558" />
        <Rect x={-13} y={-10} width={23} height={20} rx={2} fill="#101511" />
        <Rect x={-10} y={-8} width={16} height={16} rx={1.5} fill="#857e69" />
        <Rect
          x={-8}
          y={-9}
          width={16}
          height={15}
          rx={1.5}
          fill="#eadfc6"
          stroke="#b6a582"
          strokeWidth={0.6}
        />
        <Path d="M 0 -7 L 5 -2 L 0 3 L -5 -2 Z" fill="#8c4543" />
      </G>

      <G x={cx + 84} y={35} rotation={17}>
        <Path
          d="M -16 -13 H 11 Q 16 -13 17 -8 L 20 15 Q 20 19 16 19 H -12 Q -16 19 -16 15 Z"
          fill="#04140e"
          opacity={0.65}
        />
        <Path
          d="M -17 -16 H 11 Q 16 -16 17 -11 L 20 12 Q 20 16 16 16 H -13 Q -17 16 -17 12 Z"
          fill={hardware}
          stroke="#968362"
          strokeWidth={0.9}
        />
        <Path d="M -13 -12 H 11 L 15 3 H -13 Z" fill="#111613" />
        <Path d="M -10 -10 H 9 L 12 0 H -10 Z" fill="#555e54" />
        <Path d="M -13 3 H 15 L 17 10 H -13 Z" fill="#d7c7a4" />
        <Path d="M -12 5 H 15 M -12 7 H 16 M -12 9 H 16" stroke="#625f52" strokeWidth={0.65} />
        <Path
          d="M -15 -11 V 11 M 12 -13 L 17 11"
          fill="none"
          stroke="#d2c4a3"
          strokeOpacity={0.38}
          strokeWidth={0.8}
        />
      </G>
    </>
  );
}

function BlackjackTableArt({
  geometry,
  selectedSeat,
  occupants,
  disabled,
}: {
  geometry: ReturnType<typeof blackjackArcGeometry>;
  selectedSeat: number | null;
  occupants: ReadonlyMap<number, ArcOccupant> | undefined;
  disabled: boolean;
}) {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;
  const { width, height, cx, cy, railY, innerRx, innerRy, positions } = geometry;

  const perimeter = (inset: number, drop = 0) => {
    const left = inset + 1;
    const right = width - left;
    const top = railY + inset + drop;
    const bottom = height - 5 - inset + drop;
    const shoulder = cy - 2 + drop;
    const corner = Math.max(3, 13 - inset / 2);
    const curve = (right - cx) * 0.63;

    return `M ${left + corner} ${top} H ${right - corner} Q ${right} ${top} ${right} ${top + corner} V ${shoulder} C ${right} ${bottom - 56} ${cx + curve} ${bottom} ${cx} ${bottom} S ${left} ${bottom - 56} ${left} ${shoulder} V ${top + corner} Q ${left} ${top} ${left + corner} ${top} Z`;
  };

  const insuranceArc = (y: number, depth: number) =>
    `M ${cx - innerRx} ${y} Q ${cx} ${y + depth * 2} ${cx + innerRx} ${y}`;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0"
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}-walnut`} x1="8%" y1="0%" x2="30%" y2="100%">
            <Stop offset="0" stopColor="#ac7652" />
            <Stop offset="0.19" stopColor="#633b28" />
            <Stop offset="0.6" stopColor="#322017" />
            <Stop offset="0.91" stopColor="#683d29" />
            <Stop offset="1" stopColor="#21140e" />
          </LinearGradient>
          <LinearGradient id={`${id}-leather`} x1="5%" y1="0%" x2="49%" y2="100%">
            <Stop offset="0" stopColor="#52372b" />
            <Stop offset="0.33" stopColor="#2a1c17" />
            <Stop offset="0.75" stopColor="#201613" />
            <Stop offset="0.96" stopColor="#4a3127" />
            <Stop offset="1" stopColor="#241713" />
          </LinearGradient>
          <LinearGradient id={`${id}-brass`} x1="0%" y1="6%" x2="97%" y2="94%">
            <Stop offset="0" stopColor="#815934" />
            <Stop offset="0.26" stopColor="#d0ad6e" />
            <Stop offset="0.41" stopColor="#f6db9e" />
            <Stop offset="0.57" stopColor="#8c6339" />
            <Stop offset="0.76" stopColor="#c29b60" />
            <Stop offset="1" stopColor="#6d4b31" />
          </LinearGradient>
          <RadialGradient id={`${id}-baize`} cx="47%" cy="35%" rx="66%" ry="78%">
            <Stop offset="0" stopColor="#387d57" />
            <Stop offset="0.36" stopColor="#256649" />
            <Stop offset="0.68" stopColor="#164a35" />
            <Stop offset="0.87" stopColor="#103b2a" />
            <Stop offset="1" stopColor="#0a2e21" />
          </RadialGradient>
          <LinearGradient id={`${id}-hardware`} x1="0%" y1="0%" x2="28%" y2="100%">
            <Stop offset="0" stopColor="#555b51" />
            <Stop offset="0.24" stopColor="#343a34" />
            <Stop offset="0.71" stopColor="#121814" />
            <Stop offset="1" stopColor="#2b312b" />
          </LinearGradient>
          <LinearGradient id={`${id}-jade`} x1="0%" y1="0%" x2="20%" y2="100%">
            <Stop offset="0" stopColor="#29664c" />
            <Stop offset="0.47" stopColor="#174635" />
            <Stop offset="1" stopColor="#0b2a20" />
          </LinearGradient>
          <LinearGradient id={`${id}-ivory`} x1="0%" y1="0%" x2="22%" y2="100%">
            <Stop offset="0" stopColor="#fff7df" />
            <Stop offset="0.52" stopColor="#eed294" />
            <Stop offset="1" stopColor="#b6874d" />
          </LinearGradient>
          <RadialGradient id={`${id}-halo`}>
            <Stop offset="0.48" stopColor="#f9e3a2" stopOpacity={0.72} />
            <Stop offset="0.77" stopColor="#e7cb79" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#e7cb79" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Path d={perimeter(1, 4)} fill="#140d09" opacity={0.28} />
        <Path d={perimeter(0)} fill={paint("walnut")} stroke="#38251b" strokeWidth={0.8} />
        <Path
          d={perimeter(4)}
          fill={paint("leather")}
          stroke="#d6a479"
          strokeOpacity={0.5}
          strokeWidth={0.8}
        />
        <Path
          d={perimeter(8)}
          fill="none"
          stroke="#d4a179"
          strokeOpacity={0.56}
          strokeWidth={0.75}
          strokeDasharray="1.5 2.6"
        />
        <Path d={perimeter(11)} fill="#180f0b" stroke="#91644a" strokeOpacity={0.75} />
        <Path d={perimeter(12.5)} fill={paint("brass")} />
        <Path d={perimeter(15)} fill={paint("baize")} stroke="#0a1b14" strokeWidth={1.35} />
        <Path
          d={perimeter(16.5)}
          fill="none"
          stroke="#090f0a"
          strokeOpacity={0.24}
          strokeWidth={2}
        />

        <DealerStation cx={cx} hardware={paint("hardware")} />

        <G fill={PRINT_GOLD} textAnchor="middle">
          <SvgText
            x={cx}
            y={86}
            fontSize={13}
            fontFamily="serif"
            letterSpacing={0.8}
            fontWeight="700"
            fill={IVORY}
          >
            BLACKJACK PAYS 3 TO 2
          </SvgText>
          <SvgText x={cx} y={102} fontSize={8} letterSpacing={1} fontWeight="600">
            DEALER MUST STAND ON 17
          </SvgText>
          <Path
            d={insuranceArc(97, innerRy)}
            fill="none"
            stroke={PRINT_GOLD}
            strokeOpacity={0.72}
            strokeWidth={0.85}
          />
          <Path
            d={insuranceArc(115, innerRy + 5)}
            fill="none"
            stroke={PRINT_GOLD}
            strokeOpacity={0.6}
            strokeWidth={0.85}
          />
          <SvgText x={cx} y={129} fontSize={7.2} fontWeight="600" letterSpacing={0.9}>
            INSURANCE PAYS 2 TO 1
          </SvgText>
          <SvgText
            x={positions.at(-1)?.x}
            y={57}
            fontSize={8}
            fontWeight="700"
            letterSpacing={0.95}
          >
            3RD
          </SvgText>
          <SvgText x={positions[0]?.x} y={57} fontSize={8} fontWeight="700" letterSpacing={0.95}>
            1ST
          </SvgText>
        </G>

        {positions.map(({ seat, x, y }) => {
          const selected = seat === selectedSeat;
          const occupied = occupants?.has(seat);

          return (
            <G key={seat} x={x} y={y} opacity={disabled ? 0.74 : 1}>
              <Circle
                r={21}
                fill="none"
                stroke={PRINT_GOLD}
                strokeWidth={0.8}
                strokeOpacity={0.66}
              />
              <Path
                d="M -3 -21 L 0 -24 L 3 -21 M -3 21 L 0 24 L 3 21"
                fill="none"
                stroke={PRINT_GOLD}
                strokeWidth={0.8}
                strokeOpacity={0.58}
              />
              {selected ? <Circle r={28} fill={paint("halo")} /> : null}
              <Ellipse cy={2.3} rx={17.5} ry={17} fill="#04140e" opacity={0.65} />
              <Circle
                r={17.5}
                fill={paint(selected ? "ivory" : "jade")}
                stroke={selected ? IVORY : "#c1ae77"}
                strokeWidth={selected ? 1.1 : 0.85}
              />
              {!occupied ? (
                <Circle
                  r={14.2}
                  fill="none"
                  stroke={selected ? "#947048" : "#99ad84"}
                  strokeOpacity={0.58}
                  strokeWidth={0.65}
                />
              ) : null}
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
  selected = false,
}: {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  selected?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left, top, width, alignItems: "center" }}
    >
      <View
        className="justify-center rounded-full border px-1"
        style={{
          maxWidth: width,
          height,
          borderColor: selected ? "#f5dda3" : "#9c8a60",
          backgroundColor: selected ? "#f5dda3" : "#11271f",
        }}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          className="text-[11px] leading-[14px] font-semibold"
          style={{ color: selected ? "#402b18" : IVORY, includeFontPadding: false }}
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
  const geometry = blackjackArcGeometry(seats, width, { compact, largeText });
  const captionHeight = largeText ? 27 : 22;

  const spotSpacing = Math.max(
    HIT_TARGET,
    (geometry.outerRx * 2) / (geometry.positions.length - 1),
  );

  const captionLeft = (x: number, size: number) =>
    Math.max(1, Math.min(geometry.width - size - 1, x - size / 2));

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
    const nameLeft = captionLeft(x, nameWidth);
    const occupant = occupants?.get(seat);

    return { seat, x, y, nameLeft, nameWidth, occupant };
  });

  const selection = spots.find(({ seat }) => seat === selectedSeat);
  const selectionWidth = largeText ? 84 : 64;
  const selectionLeft = selection ? captionLeft(selection.x, selectionWidth) : 0;
  let selectionTop = selection ? selection.y + HALF_HIT : 0;

  if (selection) {
    for (const { occupant, nameLeft, nameWidth, y } of spots) {
      const top = y + HALF_HIT;

      if (
        occupant &&
        nameLeft < selectionLeft + selectionWidth &&
        selectionLeft < nameLeft + nameWidth &&
        top < selectionTop + captionHeight &&
        selectionTop < top + captionHeight + 3
      ) {
        selectionTop = top + captionHeight + 3;
      }
    }
  }

  return (
    <View
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);

        if (next > 0 && next !== width) setWidth(next);
      }}
      style={{ height: Math.max(geometry.height, selectionTop + captionHeight + 2) }}
      className={
        surface === "felt" ? "relative w-full rounded-2xl bg-felt-deep/40" : "relative w-full"
      }
    >
      <BlackjackTableArt
        geometry={geometry}
        selectedSeat={selectedSeat}
        occupants={occupants}
        disabled={disabled}
      />

      {spots.map(({ seat, x, y, nameLeft, nameWidth, occupant }) => {
        const selected = selectedSeat === seat;
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
            className="font-bold tabular-nums"
            style={{ color: selected ? "#352416" : IVORY, fontSize: 16, includeFontPadding: false }}
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
                top={y + HALF_HIT}
                width={nameWidth}
                height={captionHeight}
              />
            ) : null}
          </Fragment>
        );
      })}
      {selection ? (
        <SeatCaption
          label="Selected"
          left={selectionLeft}
          top={selectionTop}
          width={selectionWidth}
          height={captionHeight}
          selected
        />
      ) : null}
    </View>
  );
}

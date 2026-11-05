import { SeatingId, type CurrencyCode, type PlayerId, type SessionDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import {
  busted,
  chipEdge,
  makeDirector,
  mixCamera,
  pacing,
  restShot,
  seatLabel,
  stackOf,
  type Camera,
  type Ease,
  type Motion,
  type SeatView,
  type TableArt,
  type TableView,
} from "@stacks/client-runtime/table";
import { blackjackArt } from "@stacks/client-runtime/tableArt";
import { formatMoney } from "@stacks/shared/money";
import { tableSizes } from "@stacks/shared/seats";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PixelRatio,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { List, Row } from "../components/ui/Surface";
import { useAction, useStacks } from "../lib/stacks";
import { Chip } from "./Chip";
import { chipImages, frameImages, railImages } from "./tableImages";

// The phone keeps every other rendered angle; the camera blends between them.
// Every table size shares the camera path and the chips.
const SHARED = Object.values(blackjackArt)[0]!;
const FRAMES = Object.keys(Object.values(frameImages)[0]!).map(Number);
const REF = 18;
const STACK_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const LEVELS = SHARED.chipLevels.toSorted((a, b) => b - a);

const eases: Record<Ease, (t: number) => number> = {
  inOut: Easing.inOut(Easing.cubic),
  out: Easing.out(Easing.cubic),
};

/** A value that follows the camera's frame, piecewise between the phone's frames. */
const along = (f: Animated.Value, value: (frame: number) => number) =>
  f.interpolate({ inputRange: FRAMES, outputRange: FRAMES.map(value), extrapolate: "clamp" });

/**
 * A chip seen from the angle its spot is at, as the camera moves: every rendered angle mounted,
 * each showing only near the angle it was drawn for, switching over in a narrow band so the chip
 * never shows two outlines while the camera rests.
 */
function ChipArt({
  f,
  chip,
  size,
  angle,
}: {
  f: Animated.Value;
  chip: number;
  size: number;
  angle: (frame: number) => number;
}) {
  // Where the spot's angle sits among the rendered ones, highest first: 0 at the top angle.
  const [position] = useState(() =>
    along(f, (frame) => {
      const e = angle(frame);
      return Math.min(LEVELS.length - 1, Math.max(0, (LEVELS[0]! - e) / (LEVELS[0]! - LEVELS[1]!)));
    }),
  );
  return LEVELS.map((level, i) => {
    const sprite = SHARED.chips[level]!;
    const w = size * sprite.k;
    const h = w * sprite.aspect;
    return (
      <Animated.Image
        key={level}
        source={chipImages[level]![chip - 1]!}
        style={{
          position: "absolute",
          left: size / 2 - sprite.ox * w,
          top: size / 2 - sprite.oy * h,
          width: w,
          height: h,
          // Shown around its own angle only, fading in over the one before; the sprites' edges
          // are see-through, so two showing at once would draw the chip twice.
          opacity: position.interpolate({
            inputRange: [i - 0.6, i - 0.4, i + 0.6, i + 0.6001],
            outputRange: [i === 0 ? 1 : 0, 1, 1, i === LEVELS.length - 1 ? 1 : 0],
            extrapolate: "clamp",
          }),
        }}
      />
    );
  });
}

/** Animated values that start where an entrance begins and spring to rest once it's mounted. */
function useEntrance(enter: boolean, height: number, delay = 0) {
  const [values] = useState(() => ({
    y: new Animated.Value(enter ? -height : 0),
    opacity: new Animated.Value(enter ? 0 : 1),
  }));
  useEffect(() => {
    if (!enter) return;
    Animated.parallel([
      Animated.spring(values.y, {
        toValue: 0,
        bounciness: pacing.bounce * 20,
        speed: 14,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(values.opacity, { toValue: 1, duration: 120, delay, useNativeDriver: true }),
    ]).start();
  }, [enter, values, delay]);
  return values;
}

function SeatPiece({
  art,
  f,
  n,
  base,
  chip,
  initial,
  out,
  enter,
}: {
  art: TableArt;
  f: Animated.Value;
  n: number;
  base: number;
  chip: number;
  initial: string;
  out: boolean;
  enter: boolean;
}) {
  const { y, opacity } = useEntrance(enter, 80);
  const angle = (frame: number) => art.frames[frame]!.seats[n - 1]!.e;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        opacity: out ? Animated.multiply(opacity, 0.55) : opacity,
        transform: [{ translateY: y }],
      }}
    >
      <ChipArt f={f} chip={chip} size={base} angle={angle} />
      <Animated.View
        style={{
          position: "absolute",
          width: base,
          top: base * 0.29,
          transform: [
            { translateY: along(f, (frame) => -chipEdge(angle(frame)) * base) },
            { scaleY: along(f, (frame) => Math.sin((angle(frame) * Math.PI) / 180)) },
          ],
        }}
      >
        <Text
          className="text-center font-display text-white"
          style={{ fontSize: base * 0.42, lineHeight: base * 0.42 }}
        >
          {initial}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function ResultTag({
  out,
  currency,
}: {
  out: NonNullable<SeatView["out"]>;
  currency: CurrencyCode;
}) {
  const [flip] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(flip, {
      toValue: 1,
      duration: 520,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [flip]);
  const bust = busted(out);
  const label = bust ? "Bust" : formatMoney(out.net, currency, { signDisplay: "exceptZero" });
  // Yoga measures this against the seat, a few characters wide, so the amount wraps unless the
  // label has a width of its own. 12 is text-xs; the pill inside still hugs the text.
  const lane = (label.length * 12 + 32) * PixelRatio.getFontScale();
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: "92%",
        left: "50%",
        width: lane,
        marginLeft: -lane / 2,
        alignItems: "center",
        opacity: flip,
        transform: [
          { perspective: 200 },
          { rotateX: flip.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) },
        ],
      }}
    >
      <View
        className={
          bust || out.net < 0
            ? "rounded-md bg-loss px-2 py-0.5"
            : out.net > 0
              ? "rounded-md bg-win px-2 py-0.5"
              : "rounded-md bg-surface px-2 py-0.5"
        }
        style={{ flexDirection: "row" }}
      >
        <Text
          numberOfLines={1}
          style={{ flexShrink: 0 }}
          className={
            bust || out.net !== 0 ? "font-mono text-xs text-canvas" : "font-mono text-xs text-ink"
          }
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

function StackChip({
  art,
  f,
  n,
  k,
  size,
  chip,
  enter,
}: {
  art: TableArt;
  f: Animated.Value;
  n: number;
  k: number;
  size: number;
  chip: number;
  enter: boolean;
}) {
  const { y, opacity } = useEntrance(enter, 40, k * 40);
  const angle = (frame: number) => art.frames[frame]!.seats[n - 1]!.be;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: -size / 2,
        top: -size / 2,
        width: size,
        height: size,
        opacity,
        transform: [
          { translateY: along(f, (frame) => -k * chipEdge(angle(frame)) * size) },
          { translateY: y },
        ],
      }}
    >
      <ChipArt f={f} chip={chip} size={size} angle={angle} />
    </Animated.View>
  );
}

/**
 * The table and, while it's live, the size it's played at. A size picked here shows at once,
 * the server catching up behind it; a size the server refuses snaps back with the reason.
 */
export function TableMap(props: {
  detail: SessionDetail;
  seats: number;
  view: TableView;
  currency: CurrencyCode;
  names: ReadonlyMap<PlayerId, string>;
  chipOf: (playerId: PlayerId) => number;
}) {
  const { detail, seats, view } = props;
  const stacks = useStacks();
  const resize = useAction(stacks.Client.mutation("sessions", "setTable"));
  const sizes = tableSizes[detail.session.game]?.sizes ?? [];
  const [chosen, setChosen] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  // A pick stays until the server has the same size: an answer to an earlier pick that lands
  // after a newer one must not undo it.
  if (chosen !== null && chosen === seats) setChosen(null);
  const size = chosen ?? seats;
  const pickSize = async (next: number) => {
    setBlocked(null);
    resize.clearError();
    const inTheWay = view.seats.filter((s) => s.seat > next).map((s) => s.seat);
    if (inTheWay.length > 0)
      return setBlocked(`Move whoever's in seat ${Math.max(...inTheWay)} first.`);
    setChosen(next);
    const { error } = await resize.attempt({
      params: { sessionId: detail.session.id },
      payload: { seats: next },
    });
    if (error !== null) setChosen((current) => (current === next ? null : current));
  };
  return (
    <View>
      {/* Each size is its own table; a new one starts fresh, with its art already bundled. */}
      <TableScene key={size} {...props} seats={size} />
      {detail.session.status === "live" && sizes.length > 1 ? (
        <View className="mt-3 gap-2">
          <Choice
            label="Table size"
            options={sizes.map((option) => ({ value: String(option), label: `${option} seats` }))}
            value={String(size)}
            onChange={(option) => void pickSize(Number(option))}
          />
          {(blocked ?? resize.error) ? <FormError>{blocked ?? resize.error}</FormError> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The table, rendered in 3D ahead of time, with each seated player's chip on their seat and
 * their chips in play stacked in the betting circle. The camera follows the session: arriving at
 * an empty table, a player's-eye view while it's live, pushing in when someone leaves, and
 * overhead with everyone's result once it closes.
 */
function TableScene({
  detail,
  seats,
  view,
  currency,
  names,
  chipOf,
}: {
  detail: SessionDetail;
  seats: number;
  view: TableView;
  currency: CurrencyCode;
  names: ReadonlyMap<PlayerId, string>;
  chipOf: (playerId: PlayerId) => number;
}) {
  const art = blackjackArt[seats]!;
  const seatNumbers = art.frames[0]!.seats.map((_, i) => i + 1);
  const seatName = (n: number) => seatLabel(n, seatNumbers.length);
  const rails = Object.keys(railImages[seats]!).map(Number);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(view);
  // What was on the table when it first drew just sits there; anything after arrives with a drop.
  const [first] = useState(view);
  const arrived = (seat: number, playerId: PlayerId) =>
    !first.seats.some((s) => s.seat === seat && s.playerId === playerId);
  const arrivedChip = (seat: number, chip: number, k: number) => {
    const was = first.seats.find((s) => s.seat === seat);
    const stack = was ? stackOf(was.inPlay, currency) : { chip: 0, count: 0 };
    return stack.chip !== chip || k >= stack.count;
  };
  const [picked, setPicked] = useState<number | null>(null);
  const [camera] = useState(() => {
    const start = restShot(art, view);
    return {
      f: new Animated.Value(start.f),
      z: new Animated.Value(start.z),
      x: new Animated.Value(start.x),
      y: new Animated.Value(start.y),
      shine: new Animated.Value(0),
      // What the camera is doing, so a new move can start from wherever it is.
      move: { from: start, to: start, start: 0, ms: 0, ease: "inOut" as Ease },
    };
  });
  const [exits] = useState(() =>
    seatNumbers.map(() => ({
      piece: new Animated.Value(0),
      stack: new Animated.ValueXY(),
      fade: new Animated.Value(1),
    })),
  );
  const director = useRef<ReturnType<typeof makeDirector> | null>(null);
  const live = detail.session.status === "live";
  const height = width / art.aspect;
  const latest = useEffectEvent(() => ({ view, shown, paused: picked !== null }));

  useEffect(() => {
    if (width === 0) return;
    let reduced = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduced = r));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => {
      reduced = r;
    });
    const now = (): Camera => {
      const m = camera.move;
      const t = m.ms === 0 ? 1 : Math.min(1, (Date.now() - m.start) / m.ms);
      return mixCamera(m.from, m.to, eases[m.ease](t));
    };
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const run = (animation: Animated.CompositeAnimation) =>
      new Promise<void>((resolve) => animation.start(() => resolve()));
    const stage = {
      camera: now,
      move: (to: Camera, ms: number, ease: Ease) => {
        camera.move = { from: now(), to, start: Date.now(), ms, ease };
        const values = { f: camera.f, z: camera.z, x: camera.x, y: camera.y };
        if (ms <= 0) {
          for (const key of ["f", "z", "x", "y"] as const) values[key].setValue(to[key]);
          return Promise.resolve();
        }
        return run(
          Animated.parallel(
            (["f", "z", "x", "y"] as const).map((key) =>
              Animated.timing(values[key], {
                toValue: to[key],
                duration: ms,
                easing: eases[ease],
                useNativeDriver: true,
              }),
            ),
          ),
        );
      },
      play: (motion: Motion): Promise<void> => {
        const exit = "seat" in motion ? exits[motion.seat - 1] : undefined;
        const anchor =
          "seat" in motion ? art.frames[Math.round(now().f)]!.seats[motion.seat - 1]! : null;
        switch (motion.kind) {
          // Arrivals animate themselves as they mount; the director just waits for them.
          case "drop":
          case "flip":
            return wait(620);
          case "grow":
            return wait(620 + 40 * 9);
          case "lift":
            return run(
              Animated.timing(exit!.piece, { toValue: 1, duration: 260, useNativeDriver: true }),
            );
          case "rack":
          case "sweep": {
            const to =
              motion.kind === "rack"
                ? { x: (anchor!.bx - 0.5) * width * 0.12, y: height * 0.16 }
                : { x: (0.5 - anchor!.bx) * width * 0.7, y: (0.06 - anchor!.by) * height * 0.7 };
            const easing = Easing.bezier(0.65, 0, 0.35, 1);
            return run(
              Animated.parallel([
                Animated.timing(exit!.stack, {
                  toValue: to,
                  duration: 700,
                  easing,
                  useNativeDriver: true,
                }),
                Animated.timing(exit!.fade, {
                  toValue: 0,
                  duration: 700,
                  easing,
                  useNativeDriver: true,
                }),
              ]),
            );
          }
          case "shine":
            camera.shine.setValue(0);
            return run(
              Animated.timing(camera.shine, { toValue: 1, duration: 1200, useNativeDriver: true }),
            );
        }
      },
      show: (next: TableView) => {
        setShown(next);
        // Once the leaving pieces are gone, their seats are ready for whoever sits next.
        setTimeout(() => {
          for (const exit of exits) {
            exit.piece.setValue(0);
            exit.stack.setValue({ x: 0, y: 0 });
            exit.fade.setValue(1);
          }
        }, 50);
      },
      wait,
      paused: () => latest().paused,
      reduced: () => reduced,
    };
    director.current = makeDirector(art, currency, stage, latest().shown);
    void director.current.update(latest().view);
    return () => {
      subscription.remove();
      director.current?.stop();
      director.current = null;
    };
  }, [art, width, height, currency, camera, exits]);

  useEffect(() => {
    void director.current?.update(view);
  }, [view]);

  const onLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const bySeat = new Map(shown.seats.map((s) => [s.seat, s]));
  const world = {
    transform: [
      {
        translateX: Animated.add(
          camera.x.interpolate({
            inputRange: [0, 1],
            outputRange: [0, width],
            extrapolate: "extend",
          }),
          camera.z.interpolate({
            inputRange: [0, 1],
            outputRange: [-width / 2, 0],
            extrapolate: "extend",
          }),
        ),
      },
      {
        translateY: Animated.add(
          camera.y.interpolate({
            inputRange: [0, 1],
            outputRange: [0, height],
            extrapolate: "extend",
          }),
          camera.z.interpolate({
            inputRange: [0, 1],
            outputRange: [-height / 2, 0],
            extrapolate: "extend",
          }),
        ),
      },
      { scale: camera.z },
    ],
  };
  // The table: each frame shows from the moment the camera reaches it until it passes the next
  // one, and fades in over the frame below on the way. The frames' edges are see-through, so no
  // frame shows outside that stretch.
  const layer = (i: number) => {
    const at = FRAMES[i]!;
    const before = FRAMES[i - 1];
    const after = FRAMES[i + 1];
    return camera.f.interpolate({
      inputRange: [before ?? at - 1, at, after ?? at + 1, (after ?? at + 1) + 0.001],
      outputRange: [before === undefined ? 1 : 0, 1, 1, after === undefined ? 1 : 0],
      extrapolate: "clamp",
    });
  };
  // The rail is see-through, so its frames cross-fade instead of stacking.
  const rail = (frame: number) =>
    camera.f.interpolate({
      inputRange: [frame - 2, frame, frame + 2],
      outputRange: [0, 1, frame === FRAMES.at(-1) ? 1 : 0],
      extrapolate: "clamp",
    });
  const place = (
    n: number,
    key: "x" | "bx",
    size: (a: (typeof art.frames)[number]["seats"][number]) => number,
    base: number,
  ) => [
    {
      translateX: along(camera.f, (frame) => {
        const a = art.frames[frame]!.seats[n - 1]!;
        return (key === "x" ? a.x : a.bx) * width - base / 2;
      }),
    },
    {
      translateY: along(camera.f, (frame) => {
        const a = art.frames[frame]!.seats[n - 1]!;
        return (key === "x" ? a.y : a.by) * height - base / 2;
      }),
    },
    {
      scale: along(
        camera.f,
        (frame) => size(art.frames[frame]!.seats[n - 1]!) / size(art.frames[REF]!.seats[n - 1]!),
      ),
    },
  ];

  return (
    <View className="-mx-4" onLayout={onLayout}>
      {width === 0 ? (
        <View style={{ aspectRatio: art.aspect }} />
      ) : (
        <View
          style={{ height, overflow: "hidden" }}
          accessibilityRole="image"
          accessibilityLabel={`Blackjack table, ${shown.seats.length} of ${seatNumbers.length} seats taken`}
        >
          <Animated.View style={[{ position: "absolute", width, height }, world]}>
            {FRAMES.map((frame, i) => (
              <Animated.Image
                key={frame}
                source={frameImages[seats]![frame]!}
                style={{ position: "absolute", width, height, opacity: layer(i) }}
              />
            ))}
            {shown.seats.map((s) => {
              const { chip, count } = stackOf(s.inPlay, currency);
              if (count === 0) return null;
              const size = art.frames[REF]!.seats[s.seat - 1]!.br * 2 * width;
              const exit = exits[s.seat - 1]!;
              return (
                <Animated.View
                  key={`stack-${s.seat}-${chip}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: 0,
                    height: 0,
                    opacity: exit.fade,
                    transform: [
                      ...place(s.seat, "bx", (a) => a.br, 0),
                      { translateX: exit.stack.x },
                      { translateY: exit.stack.y },
                    ],
                  }}
                >
                  {STACK_SLOTS.slice(0, count).map((slot, k) => (
                    <StackChip
                      art={art}
                      key={slot}
                      f={camera.f}
                      n={s.seat}
                      k={k}
                      size={size}
                      chip={chip}
                      enter={arrivedChip(s.seat, chip, k)}
                    />
                  ))}
                </Animated.View>
              );
            })}
            {seatNumbers.map((n) => {
              const s = bySeat.get(n);
              const base = art.frames[REF]!.seats[n - 1]!.r * 2 * width;
              const name = s ? (names.get(s.playerId) ?? "Player") : null;
              const label = s
                ? `${seatName(n)}, ${name}${
                    s.out
                      ? `, ${busted(s.out) ? "busted" : formatMoney(s.out.net, currency, { signDisplay: "exceptZero" })}`
                      : s.inPlay > 0
                        ? `, ${formatMoney(s.inPlay, currency)} in play`
                        : ""
                  }`
                : `${seatName(n)}, empty`;
              const exit = exits[n - 1]!;
              return (
                <Animated.View
                  key={n}
                  style={{
                    position: "absolute",
                    width: base,
                    height: base,
                    transform: place(n, "x", (a) => a.r, base),
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: !live }}
                    disabled={!live}
                    onPress={() => setPicked(n)}
                    className="flex-1 rounded-full"
                  >
                    {s ? (
                      <Animated.View
                        key={s.playerId}
                        style={{
                          flex: 1,
                          opacity: exit.piece.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0],
                          }),
                          transform: [
                            {
                              translateY: exit.piece.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -24],
                              }),
                            },
                          ],
                        }}
                      >
                        <SeatPiece
                          art={art}
                          f={camera.f}
                          n={n}
                          base={base}
                          chip={chipOf(s.playerId)}
                          initial={name!.slice(0, 1).toUpperCase()}
                          out={s.out !== null}
                          enter={arrived(n, s.playerId)}
                        />
                      </Animated.View>
                    ) : null}
                    {s?.out ? (
                      <ResultTag key={`${s.out.net}`} out={s.out} currency={currency} />
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
            {rails.map((frame) => (
              <Animated.Image
                key={frame}
                pointerEvents="none"
                source={railImages[seats]![frame]!}
                style={{ position: "absolute", width, height, opacity: rail(frame) }}
              />
            ))}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: width * 0.4,
                backgroundColor: "rgba(255, 236, 190, 0.22)",
                opacity: camera.shine.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0, 1, 0],
                }),
                transform: [
                  {
                    translateX: camera.shine.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-width * 0.4, width],
                    }),
                  },
                  { skewX: "-15deg" },
                ],
              }}
            />
          </Animated.View>
        </View>
      )}
      <SeatSheet
        detail={detail}
        seatNumbers={seatNumbers}
        seat={picked}
        view={shown}
        names={names}
        chipOf={chipOf}
        onClose={() => setPicked(null)}
      />
    </View>
  );
}

/** Seat someone in an empty seat, or move or stand up whoever's in it. */
function SeatSheet({
  detail,
  seatNumbers,
  seat,
  view,
  names,
  chipOf,
  onClose,
}: {
  detail: SessionDetail;
  seatNumbers: ReadonlyArray<number>;
  seat: number | null;
  view: TableView;
  names: ReadonlyMap<PlayerId, string>;
  chipOf: (playerId: PlayerId) => number;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const sit = useAction(stacks.Client.mutation("sessions", "seat"));
  const sitting = seat === null ? null : (view.seats.find((s) => s.seat === seat) ?? null);
  const seatOf = new Map(view.seats.map((s) => [s.playerId, s.seat]));
  const seatName = (n: number) => seatLabel(n, seatNumbers.length);
  const free = seatNumbers.filter((n) => !view.seats.some((s) => s.seat === n));
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Player";
  const save = async (playerId: PlayerId, to: number | null) => {
    const done = await sit.run({
      params: { sessionId: detail.session.id },
      payload: { id: SeatingId.make(newId()), playerId, seat: to },
    });
    if (done) onClose();
  };
  const close = () => {
    sit.clearError();
    onClose();
  };
  return (
    <Sheet
      open={seat !== null}
      onClose={close}
      title={
        seat === null ? "" : sitting ? `${name(sitting.playerId)} · Seat ${seat}` : seatName(seat)
      }
      description={sitting ? undefined : "Who's sitting here?"}
      footer={
        sitting ? (
          <Button
            label="Stand up"
            variant="danger"
            disabled={sit.pending}
            onPress={() => void save(sitting.playerId, null)}
          />
        ) : undefined
      }
    >
      <List>
        {sitting
          ? free.map((n) => (
              <Row key={n} onPress={() => void save(sitting.playerId, n)}>
                <Text className="text-base text-ink">Move to {seatName(n).toLowerCase()}</Text>
              </Row>
            ))
          : detail.playerIds.map((playerId) => (
              <Row key={playerId} onPress={() => void save(playerId, seat)}>
                <Chip chip={chipOf(playerId)} name={name(playerId)} size={28} />
                <Text className="flex-1 text-base text-ink">{name(playerId)}</Text>
                {seatOf.has(playerId) ? (
                  <Text className="text-sm text-muted">from seat {seatOf.get(playerId)}</Text>
                ) : null}
              </Row>
            ))}
      </List>
      {sit.error ? <FormError>{sit.error}</FormError> : null}
    </Sheet>
  );
}

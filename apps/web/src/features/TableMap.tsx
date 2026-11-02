import { SeatingId, type CurrencyCode, type PlayerId, type SessionDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import {
  anchorsAt,
  frameAt,
  busted,
  chipAngles,
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
  type TableArt,
  type TableView,
} from "@stacks/client-runtime/table";
import { blackjackArt } from "@stacks/client-runtime/tableArt";
import { formatMoney } from "@stacks/shared/money";
import { tableSizes } from "@stacks/shared/seats";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { useAction, useStacks } from "~/lib/stacks";

// The web takes chips by the sheet; the single chips are for the phone.
const urls = import.meta.glob<string>(
  ["../../../../packages/client-runtime/table-art/*.webp", "!**/chip-*.webp"],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
const url = (name: string) => urls[`../../../../packages/client-runtime/table-art/${name}.webp`]!;

interface Images {
  readonly seats: number;
  readonly frames: Array<HTMLImageElement | null>;
  readonly rails: Array<HTMLImageElement | null>;
}

const load = async (src: string) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};
const pad = (i: number) => String(i).padStart(2, "0");

// A table shows as soon as the frame it opens on and the chip angles its seats need are decoded.
// Everything else follows in one background queue, most useful first, which a new table size
// replaces rather than joins: on a phone's connection, extra downloads only slow the one that
// matters.
/** One sheet per chip angle: the eight chip colors side by side. */
const chipSheets: Record<number, HTMLImageElement> = {};
const chipsLoading = new Map<number, Promise<void>>();
const loadChips = (level: number) => {
  const done =
    chipsLoading.get(level) ??
    load(url(`chips-${level}`)).then((img) => void (chipSheets[level] = img));
  chipsLoading.set(level, done);
  return done;
};
const tables = new Map<number, { images: Images; loading: Map<number, Promise<void>> }>();
const tableOf = (seats: number) => {
  let table = tables.get(seats);
  if (!table) {
    const frames = blackjackArt[seats]!.frames;
    table = {
      images: { seats, frames: frames.map(() => null), rails: frames.map(() => null) },
      loading: new Map(),
    };
    tables.set(seats, table);
  }
  return table;
};
const loadFrame = (seats: number, i: number) => {
  const { images, loading } = tableOf(seats);
  const done =
    loading.get(i) ??
    Promise.all([
      load(url(`frame-${seats}-${pad(i)}`)).then((img) => void (images.frames[i] = img)),
      blackjackArt[seats]!.frames[i]!.rail
        ? load(url(`rail-${seats}-${pad(i)}`)).then((img) => void (images.rails[i] = img))
        : null,
    ]).then(() => undefined);
  loading.set(i, done);
  return done;
};
/** The chip angles the seats at frame `i` are drawn from. */
const levelsAt = (art: TableArt, i: number) => {
  const levels = new Set<number>();
  for (const seat of art.frames[i]!.seats)
    for (const e of [seat.e, seat.be]) {
      const { low, high } = chipAngles(art, e);
      levels.add(low).add(high);
    }
  return levels;
};
let queue = 0;
const loadImages = async (seats: number, first: number, others: ReadonlyArray<number>) => {
  const art = blackjackArt[seats]!;
  const run = ++queue;
  await Promise.all([loadFrame(seats, first), ...[...levelsAt(art, first)].map(loadChips)]);
  const near = (a: number, b: number) => Math.abs(a - first) - Math.abs(b - first);
  const rest = [
    // The other sizes' table at this angle, so switching size never waits.
    ...others.filter((n) => n !== seats).map((n) => () => loadFrame(n, first)),
    ...art.chipLevels
      .toSorted((a, b) => near(frameAt(art, a), frameAt(art, b)))
      .map((l) => () => loadChips(l)),
    ...art.frames
      .map((_, i) => i)
      .toSorted(near)
      .map((i) => () => loadFrame(seats, i)),
  ];
  void (async () => {
    for (const next of rest) {
      if (run !== queue) return;
      await next();
    }
  })();
  return tableOf(seats).images;
};

/** The loaded frame nearest `i`, for a move that gets ahead of the download. */
const nearest = (list: Images["frames"], i: number) => {
  for (let d = 0; d < list.length; d++) {
    const image = list[i - d] ?? list[i + d];
    if (image) return image;
  }
  return null;
};

/** A chip canvas is this many chip diameters square, with the chip's contact point at its middle. */
const BOX = 1.6;
const STACK_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

const eases: Record<Ease, (t: number) => number> = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
};

/** A spring settling from 1 to 0, sampled for a keyframe animation. */
const spring = (bounce: number, steps = 40) => {
  const zeta = Math.max(0.2, 1 - bounce);
  const omega = Math.log(400) / Math.max(zeta, 0.35);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    if (i === steps) return 0;
    return (
      Math.exp(-zeta * omega * t) *
      (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t))
    );
  });
};

/** Draws a chip seen from `degrees`, cross-fading the two nearest rendered angles on its contact point. */
function drawChip(art: TableArt, canvas: HTMLCanvasElement, chip: number, degrees: number) {
  // A chip angle arriving later redraws the chip with it.
  const key = `${chip}:${degrees.toFixed(1)}:${Object.keys(chipSheets).length}`;
  if (canvas.dataset.key === key) return;
  canvas.dataset.key = key;
  const { low, high, t } = chipAngles(art, degrees);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const D = W / BOX;
  const draw = (wanted: number, alpha: number) => {
    // An angle still downloading borrows the nearest one already in.
    const level = art.chipLevels
      .filter((l) => chipSheets[l])
      .reduce<number | null>(
        (best, l) => (best === null || Math.abs(l - wanted) < Math.abs(best - wanted) ? l : best),
        null,
      );
    if (level === null) return;
    const sprite = art.chips[level]!;
    const sheet = chipSheets[level]!;
    const cell = sheet.width / 8;
    const sw = D * sprite.k;
    const sh = sw * sprite.aspect;
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      sheet,
      (chip - 1) * cell,
      0,
      cell,
      sheet.height,
      W / 2 - sprite.ox * sw,
      W / 2 - sprite.oy * sh,
      sw,
      sh,
    );
  };
  ctx.clearRect(0, 0, W, W);
  // The nearer angle stays opaque underneath, so the chip never turns see-through mid-fade.
  const [under, over, k] = t < 0.5 ? [low, high, t] : [high, low, 1 - t];
  draw(under, 1);
  if (k > 0.01) draw(over, k);
}

/**
 * The table, rendered in 3D ahead of time, with each seated player's chip on their seat and
 * their chips in play stacked in the betting circle. The camera follows the session: arriving at
 * an empty table, a player's-eye view while it's live, pushing in when someone leaves, and
 * overhead with everyone's result once it closes.
 */
export function TableMap({
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
  const [loaded, setLoaded] = useState<Images | null>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(view);
  const [picked, setPicked] = useState<number | null>(null);
  // A size picked here shows at once; the server catches up behind it, or it snaps back.
  const [chosen, setChosen] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  // A pick stays until the server has the same size: an answer to an earlier pick that lands
  // after a newer one must not undo it.
  if (chosen !== null && chosen === seats) setChosen(null);
  const size = chosen ?? seats;
  const outer = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLDivElement>(null);
  // A new table size keeps the old table on screen until its frames are in.
  const art = blackjackArt[loaded?.seats ?? size]!;
  const seatNumbers = art.frames[0]!.seats.map((_, i) => i + 1);
  const seatName = (n: number) => seatLabel(n, seatNumbers.length);
  const camera = useRef<Camera>(restShot(art, view));
  const director = useRef<ReturnType<typeof makeDirector> | null>(null);
  const live = detail.session.status === "live";
  const stacks = useStacks();
  const resize = useAction(stacks.Client.mutation("sessions", "setTable"));
  const sizes = tableSizes[detail.session.game]?.sizes ?? [];

  useEffect(() => {
    let cancelled = false;
    const at = Math.round(camera.current.f);
    void loadImages(size, at, tableSizes[detail.session.game]?.sizes ?? []).then(
      (imgs) => !cancelled && setLoaded(imgs),
    );
    return () => {
      cancelled = true;
    };
  }, [size, detail.session.game]);

  const pickSize = async (next: number) => {
    setBlocked(null);
    resize.clearError();
    const inTheWay = shown.seats.filter((s) => s.seat > next).map((s) => s.seat);
    if (inTheWay.length > 0)
      return setBlocked(`Move whoever's in seat ${Math.max(...inTheWay)} first.`);
    setChosen(next);
    const { error } = await resize.attempt({
      params: { sessionId: detail.session.id },
      payload: { seats: next },
    });
    if (error !== null) setChosen((current) => (current === next ? null : current));
  };

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = Math.round(width / art.aspect);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  /** Puts everything where the camera says: the table's frames, the push, every chip. */
  const paint = () => {
    const root = map.current;
    if (!root || !loaded || width === 0) return;
    const cam = camera.current;
    const i = Math.min(art.frames.length - 2, Math.floor(cam.f));
    const t = cam.f - i;
    for (const [selector, list] of [
      ["canvas[data-layer=table]", loaded.frames],
      ["canvas[data-layer=rail]", loaded.rails],
    ] as const) {
      const canvas = root.querySelector<HTMLCanvasElement>(selector)!;
      const ctx = canvas.getContext("2d")!;
      // The table always draws something; a rail still downloading just waits.
      const a = list[i] ?? (list === loaded.frames ? nearest(list, Math.round(cam.f)) : null);
      const b = t > 0.001 && list[i] ? (list[i + 1] ?? null) : null;
      // The rail layer is empty at the high angles, where it never covers a chip.
      if (canvas.dataset.drawn === "none" && !a && !b) continue;
      canvas.dataset.drawn = a || b ? "some" : "none";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = a ? 1 : t;
      if (a) ctx.drawImage(a, 0, 0, canvas.width, canvas.height);
      if (b) {
        ctx.globalAlpha = t;
        ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
      }
    }
    const world = root.querySelector<HTMLDivElement>("[data-world]")!;
    world.style.transform = `translate3d(${cam.x * width}px, ${cam.y * height}px, 0) scale(${cam.z})`;
    const anchors = anchorsAt(art, cam.f);
    for (const el of root.querySelectorAll<HTMLElement>("[data-seat]")) {
      const a = anchors[Number(el.dataset.seat) - 1]!;
      const size = a.r * 2 * width;
      el.style.width = el.style.height = `${size}px`;
      el.style.transform = `translate3d(${a.x * width - size / 2}px, ${a.y * height - size / 2}px, 0)`;
      const chip = el.querySelector<HTMLCanvasElement>("canvas");
      if (!chip) continue;
      drawChip(art, chip, Number(chip.dataset.chip), a.e);
      el.querySelector<HTMLElement>("[data-initial]")!.style.transform =
        `translate(-50%, -50%) translateY(${-chipEdge(a.e) * size}px) scaleY(${Math.sin((a.e * Math.PI) / 180).toFixed(3)})`;
    }
    for (const el of root.querySelectorAll<HTMLElement>("[data-stack]")) {
      const a = anchors[Number(el.dataset.stack) - 1]!;
      const size = a.br * 2 * width;
      const edge = chipEdge(a.be) * size;
      el.style.transform = `translate3d(${a.bx * width}px, ${a.by * height}px, 0)`;
      for (const [k, chip] of [...el.querySelectorAll<HTMLCanvasElement>("canvas")].entries()) {
        chip.style.width = chip.style.height = `${size * BOX}px`;
        chip.style.transform = `translate3d(${(-size * BOX) / 2}px, ${(-size * BOX) / 2 - k * edge}px, 0)`;
        drawChip(art, chip, Number(chip.dataset.chip), a.be);
      }
    }
  };
  const paintNow = useEffectEvent(paint);
  useLayoutEffect(() => paintNow());
  const latest = useEffectEvent(() => ({ view, shown, paused: picked !== null }));

  // The director plays each change to the table as it arrives.
  useEffect(() => {
    if (!loaded) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const root = () => map.current;
    let moving = 0;
    const animate = (
      el: Element | null | undefined,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) =>
      el
        ? el.animate(frames, options).finished.then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve();
    const stage = {
      camera: () => camera.current,
      move: (to: Camera, ms: number, ease: Ease) =>
        new Promise<void>((resolve) => {
          const from = camera.current;
          const run = ++moving;
          if (ms <= 0) {
            camera.current = to;
            paintNow();
            return resolve();
          }
          const start = performance.now();
          const step = (now: number) => {
            if (run !== moving) return resolve();
            const t = Math.min(1, (now - start) / ms);
            camera.current = mixCamera(from, to, eases[ease](t));
            paintNow();
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        }),
      play: (motion: Motion): Promise<void> => {
        const el = root();
        if (!el) return Promise.resolve();
        const seat = "seat" in motion ? motion.seat : 0;
        const piece = el.querySelector(`[data-seat="${seat}"] [data-piece]`);
        const stack = el.querySelector(`[data-stack="${seat}"]`);
        const bounce = spring(pacing.bounce);
        // Animations use translate and scale, which add to the transform that places each chip.
        const drop = (target: Element | null, height: number, delay = 0) =>
          animate(
            target,
            bounce.map((x, i) => ({
              translate: `0 ${-height * x}px`,
              scale: `${1 + 0.1 * Math.max(0, x)}`,
              opacity: i === 0 ? 0 : 1,
            })),
            { duration: 620, delay, easing: "linear", fill: "backwards" },
          );
        const leave = (target: Element | null, dx: number, dy: number, scale: number) =>
          animate(
            target,
            [
              { translate: "0 0", opacity: 1 },
              { translate: `${dx}px ${dy}px`, scale: `${scale}`, opacity: 0 },
            ],
            { duration: 700, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
          );
        const a = anchorsAt(art, camera.current.f)[Math.max(0, seat - 1)]!;
        switch (motion.kind) {
          case "drop":
            return drop(piece, 80);
          case "lift":
            return animate(piece, [{ opacity: 1 }, { translate: "0 -24px", opacity: 0 }], {
              duration: 260,
              easing: "ease-in",
              fill: "forwards",
            });
          case "grow":
            return Promise.all(
              [...(stack?.querySelectorAll("canvas") ?? [])]
                .slice(motion.from)
                .map((chip, k) => drop(chip, 40, k * 40)),
            ).then(() => undefined);
          case "rack":
            return leave(stack, (a.bx - 0.5) * width * 0.12, height * 0.16, 0.85);
          case "sweep":
            return leave(stack, (0.5 - a.bx) * width * 0.7, (0.06 - a.by) * height * 0.7, 0.6);
          case "shine":
            return animate(
              el.querySelector("[data-shine]"),
              [
                { opacity: 0, translate: "-40% 0" },
                { opacity: 1, offset: 0.3 },
                { opacity: 0, translate: "40% 0" },
              ],
              { duration: 1200, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
            );
          case "flip":
            return Promise.all(
              motion.seats.map((n, k) =>
                animate(
                  el.querySelector(`[data-seat="${n}"] [data-result]`),
                  [
                    { transform: "perspective(200px) rotateX(-90deg)", opacity: 0 },
                    { transform: "perspective(200px) rotateX(12deg)", opacity: 1, offset: 0.7 },
                    { transform: "none", opacity: 1 },
                  ],
                  {
                    duration: 520,
                    delay: k * 140,
                    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
                    fill: "backwards",
                  },
                ),
              ),
            ).then(() => undefined);
        }
      },
      // The table on screen changes in the same frame the director moves on, so effects find it.
      show: (next: TableView) => flushSync(() => setShown(next)),
      wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      paused: () => latest().paused,
      reduced: () => reduced.matches,
    };
    director.current = makeDirector(art, currency, stage, latest().shown);
    void director.current.update(latest().view);
    return () => {
      moving++;
      director.current?.stop();
      director.current = null;
    };
  }, [loaded, art, currency, width, height]);

  useEffect(() => {
    void director.current?.update(view);
  }, [view]);

  const bySeat = new Map(shown.seats.map((s) => [s.seat, s]));
  const pickedSeat = picked === null ? null : (bySeat.get(picked) ?? null);

  return (
    <div ref={outer} className="-mx-4 sm:mx-0">
      {!loaded || width === 0 ? (
        <Skeleton className="aspect-[1.8] w-full rounded-none sm:rounded-2xl" />
      ) : (
        <div
          ref={map}
          className="relative overflow-hidden select-none sm:rounded-2xl"
          style={{ height }}
        >
          <div data-world className="absolute inset-0 origin-top-left will-change-transform">
            <canvas
              data-layer="table"
              width={Math.round(width * dpr)}
              height={Math.round(height * dpr)}
              className="block size-full"
              role="img"
              aria-label={`Blackjack table, ${shown.seats.length} of ${seatNumbers.length} seats taken`}
            />
            {shown.seats.map((s) => {
              const { chip, count } = stackOf(s.inPlay, currency);
              return count === 0 ? null : (
                <div
                  key={`stack-${s.seat}-${chip}`}
                  data-stack={s.seat}
                  className="pointer-events-none absolute top-0 left-0 will-change-transform"
                >
                  {STACK_SLOTS.slice(0, count).map((slot) => (
                    <canvas
                      key={slot}
                      data-chip={chip}
                      width={Math.round(art.frames[0]!.seats[0]!.br * 2 * width * BOX * dpr * 1.5)}
                      height={Math.round(art.frames[0]!.seats[0]!.br * 2 * width * BOX * dpr * 1.5)}
                      className="absolute top-0 left-0"
                    />
                  ))}
                </div>
              );
            })}
            {seatNumbers.map((n) => {
              const s = bySeat.get(n);
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
              const size = art.frames[0]!.seats[n - 1]!.r * 2 * width;
              return (
                <button
                  key={n}
                  type="button"
                  data-seat={n}
                  aria-label={label}
                  disabled={!live}
                  onClick={() => setPicked(n)}
                  className="group absolute top-0 left-0 grid place-items-center rounded-full will-change-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default"
                >
                  {s ? (
                    <span
                      key={s.playerId}
                      data-piece
                      className={
                        s.out ? "absolute inset-0 opacity-55 saturate-50" : "absolute inset-0"
                      }
                    >
                      <canvas
                        data-chip={chipOf(s.playerId)}
                        width={Math.round(size * BOX * dpr * 1.5)}
                        height={Math.round(size * BOX * dpr * 1.5)}
                        className="absolute top-1/2 left-1/2 -translate-1/2"
                        style={{ width: `${BOX * 100}%`, height: `${BOX * 100}%` }}
                      />
                      <span
                        data-initial
                        className="absolute top-1/2 left-1/2 font-display leading-none text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]"
                        style={{ fontSize: size * 0.42 }}
                      >
                        {name!.slice(0, 1).toUpperCase()}
                      </span>
                    </span>
                  ) : live ? (
                    <span className="absolute inset-[8%] rounded-full border-2 border-dashed border-white/0 transition-colors duration-150 group-hover:border-white/40 group-focus-visible:border-white/40" />
                  ) : null}
                  {s?.out ? (
                    <span
                      data-result
                      className={
                        "absolute top-[92%] left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 font-mono text-xs font-semibold whitespace-nowrap shadow-[0_2px_8px_rgb(0_0_0/0.35)] " +
                        (busted(s.out) || s.out.net < 0
                          ? "bg-loss text-canvas"
                          : s.out.net > 0
                            ? "bg-win text-canvas"
                            : "bg-surface text-ink")
                      }
                    >
                      {busted(s.out)
                        ? "Bust"
                        : formatMoney(s.out.net, currency, { signDisplay: "exceptZero" })}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <canvas
              data-layer="rail"
              width={Math.round(width * dpr)}
              height={Math.round(height * dpr)}
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden
            />
            <div
              data-shine
              className="pointer-events-none absolute -inset-x-[60%] -inset-y-[20%] bg-[linear-gradient(105deg,transparent_40%,rgb(255_236_190/0.38)_50%,transparent_60%)] opacity-0 mix-blend-screen"
            />
          </div>
        </div>
      )}
      {live && sizes.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 px-4 sm:px-0">
          <div role="group" aria-label="Table size" className="flex gap-1 rounded-lg bg-sunken p-1">
            {sizes.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={size === option}
                onClick={() => void pickSize(option)}
                className={
                  size === option
                    ? "inline-flex h-8 items-center rounded-md bg-surface px-3 text-sm font-medium text-ink shadow-sm pointer-coarse:h-10"
                    : "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink pointer-coarse:h-10"
                }
              >
                {option} seats
              </button>
            ))}
          </div>
          {(blocked ?? resize.error) ? <FormError>{blocked ?? resize.error}</FormError> : null}
        </div>
      ) : null}
      <SeatDialog
        detail={detail}
        seatNumbers={seatNumbers}
        seat={picked}
        sitting={pickedSeat}
        view={shown}
        names={names}
        chipOf={chipOf}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}

/** Seat someone in an empty seat, or move or stand up whoever's in it. */
function SeatDialog({
  detail,
  seatNumbers,
  seat,
  sitting,
  view,
  names,
  chipOf,
  onClose,
}: {
  detail: SessionDetail;
  seatNumbers: ReadonlyArray<number>;
  seat: number | null;
  sitting: TableView["seats"][number] | null;
  view: TableView;
  names: ReadonlyMap<PlayerId, string>;
  chipOf: (playerId: PlayerId) => number;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const sit = useAction(stacks.Client.mutation("sessions", "seat"));
  const seatOf = new Map(view.seats.map((s) => [s.playerId, s.seat]));
  const seatName = (n: number) => seatLabel(n, seatNumbers.length);
  const free = seatNumbers.filter((n) => !view.seats.some((s) => s.seat === n));
  const save = async (playerId: PlayerId, to: number | null) => {
    const done = await sit.run({
      params: { sessionId: detail.session.id },
      payload: { id: SeatingId.make(newId()), playerId, seat: to },
    });
    if (done) onClose();
  };
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Player";
  return (
    <Dialog
      open={seat !== null}
      onOpenChange={(open) => {
        if (!open) {
          sit.clearError();
          onClose();
        }
      }}
      title={
        seat === null
          ? ""
          : sitting
            ? `${name(sitting.playerId)} · ${seatName(seat)}`
            : seatName(seat)
      }
      description={sitting ? undefined : "Who's sitting here?"}
    >
      <div className="flex flex-col gap-2">
        {seat === null ? null : sitting ? (
          <>
            {free.map((n) => (
              <Button
                key={n}
                variant="ghost"
                className="justify-start"
                disabled={sit.pending}
                onClick={() => void save(sitting.playerId, n)}
              >
                Move to {seatName(n).toLowerCase()}
              </Button>
            ))}
            <Button
              variant="danger"
              disabled={sit.pending}
              onClick={() => void save(sitting.playerId, null)}
            >
              Stand up
            </Button>
          </>
        ) : (
          detail.playerIds.map((playerId) => (
            <Button
              key={playerId}
              variant="ghost"
              className="justify-start gap-3"
              disabled={sit.pending}
              onClick={() => void save(playerId, seat)}
            >
              <Chip chip={chipOf(playerId)} name={name(playerId)} size={28} />
              <span className="flex-1 text-left">{name(playerId)}</span>
              {seatOf.has(playerId) ? (
                <span className="text-sm text-muted">from seat {seatOf.get(playerId)}</span>
              ) : null}
            </Button>
          ))
        )}
        {sit.error ? <FormError>{sit.error}</FormError> : null}
      </div>
    </Dialog>
  );
}

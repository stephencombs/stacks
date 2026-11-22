/**
 * A track for bars that grow from break-even: where zero sits and how much of the track a value
 * covers, both as fractions. The largest magnitude fills its side exactly.
 *
 * `compress` draws lengths by square root, so a $60 balance still shows beside an $18,500 one.
 * Only use it where the exact amount is printed next to the bar. `minimum` keeps any non-zero bar
 * at least that fraction of the track, so it never reads as zero.
 */
export const barTrack = (
  values: Iterable<number>,
  {
    compress = false,
    minimum = 0,
  }: { readonly compress?: boolean; readonly minimum?: number } = {},
) => {
  const length = (value: number) => (compress ? Math.sqrt(Math.abs(value)) : Math.abs(value));
  let low = 0;
  let high = 0;

  for (const value of values) {
    if (value < 0) low = Math.max(low, length(value));

    if (value > 0) high = Math.max(high, length(value));
  }

  const span = high + low || 1;
  const zero = low / span;

  return {
    zero,
    extent: (value: number) =>
      value === 0
        ? 0
        : Math.min(Math.max(length(value) / span, minimum), value > 0 ? 1 - zero : zero),
  };
};

/**
 * A plot for lines of running totals: x spreads the points evenly across the width, y puts the
 * highest value at the top and the lowest at the bottom, with break-even always in range.
 *
 * `focus` names the series the plot is about, by index. The range fits those, plus any other
 * line that stays within one focus-range of them; a line further out is pinned to the edge and
 * `clipped` says which way it ran off, so one high roller can't flatten everyone else.
 */
export const lineScale = (
  series: ReadonlyArray<ReadonlyArray<number>>,
  size: { readonly width: number; readonly height: number },
  pad: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
  focus?: ReadonlyArray<number>,
) => {
  const range = (lines: ReadonlyArray<ReadonlyArray<number>>) => {
    let low = 0;
    let high = 0;

    for (const values of lines)
      for (const value of values) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }

    return { low, high };
  };

  const count = Math.max(0, ...series.map((values) => values.length));
  let { low, high } = range(focus ? focus.map((i) => series[i] ?? []) : series);
  const reach = high - low;

  if (!focus || reach === 0) ({ low, high } = range(series));
  else
    for (const values of series)
      for (const value of values)
        if (value >= low - reach && value <= high + reach) {
          low = Math.min(low, value);
          high = Math.max(high, value);
        }

  const span = high - low || 1;
  const clamp = (value: number) => Math.min(high, Math.max(low, value));
  const x = (i: number) => pad.x + (count <= 1 ? 0 : i / (count - 1)) * (size.width - 2 * pad.x);
  const y = (value: number) => pad.y + ((high - clamp(value)) / span) * (size.height - 2 * pad.y);

  return {
    x,
    y,
    zero: y(0),
    clipped: (value: number) => (value > high ? 1 : value < low ? -1 : 0),
    points: (values: ReadonlyArray<number>) => values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
  };
};

/** The lines worth fitting a race plot around: the one at `index` and its neighbours on the board. */
export const around = (index: number, count: number) =>
  [index - 1, index, index + 1].filter((i) => i >= 0 && i < count);

/**
 * Label positions for the ends of lines, nudged apart so no two sit closer than `gap`, kept in
 * their original order and inside [min, max]. When the gap cannot fit, it shrinks so every label
 * stays on the plot instead of running off an edge. Returned in input order.
 */
export const spreadLabels = (
  ys: ReadonlyArray<number>,
  gap: number,
  bounds: { readonly min: number; readonly max: number },
) => {
  const order = ys.map((y, i) => ({ y, i })).toSorted((a, b) => a.y - b.y || a.i - b.i);
  const n = order.length;
  const room = Math.max(0, bounds.max - bounds.min);
  const step = n <= 1 ? 0 : Math.min(gap, room / (n - 1));
  const placed = order.map((o) => Math.min(bounds.max, Math.max(bounds.min, o.y)));

  for (let k = 1; k < n; k++) placed[k] = Math.max(placed[k]!, placed[k - 1]! + step);

  if (n > 0 && placed[n - 1]! > bounds.max) {
    placed[n - 1] = bounds.max;

    for (let k = n - 2; k >= 0; k--) placed[k] = Math.min(placed[k]!, placed[k + 1]! - step);
  }

  const out = Array.from({ length: n }, () => bounds.min);
  order.forEach((o, k) => (out[o.i] = placed[k]!));

  return out;
};

/**
 * How wide a chart label is, in the same units as `fontSize`. UI text runs wider than half an em;
 * reserving 0.75em keeps the first character inside the plot when the anchor sits on an edge.
 */
export const labelWidth = (text: string, fontSize: number) =>
  Math.max(fontSize, text.length * fontSize * 0.75);

/**
 * Where to draw a label of `width` that wants its center on `at`. A label that would cross an
 * edge is pinned to that edge, anchor on the inside, so the first or last character stays visible.
 */
export const placeLabel: (
  at: number,
  width: number,
  bounds: { readonly min: number; readonly max: number },
) => { readonly x: number; readonly anchor: "start" | "middle" | "end" } = (at, width, bounds) => {
  const span = bounds.max - bounds.min;

  if (!(width > 0) || span <= 0 || width >= span || at - width / 2 < bounds.min)
    return { x: bounds.min, anchor: "start" };

  if (at + width / 2 > bounds.max) return { x: bounds.max, anchor: "end" };

  return { x: at, anchor: "middle" };
};

/** Keep the first and last readable, then fill gaps with the marks that fit. */
export function fitAxisLabels(
  marks: ReadonlyArray<{ index: number; label: string; x: number }>,
  fontSize: number,
  bounds: { min: number; max: number },
) {
  const placed = marks.map((mark) => {
    const width = labelWidth(mark.label, fontSize);
    const { x, anchor } = placeLabel(mark.x, width, bounds);
    const left = x - { start: 0, middle: 0.5, end: 1 }[anchor] * width;

    return { index: mark.index, label: mark.label, x, anchor, left, right: left + width };
  });

  const first = placed[0];
  const last = placed.at(-1);

  if (!first || !last) return [];

  if (first === last || first.right + 4 > last.left) return [first];

  const visible = [first];

  for (const mark of placed.slice(1, -1)) {
    if (mark.left >= visible.at(-1)!.right + 4 && mark.right + 4 <= last.left) {
      visible.push(mark);
    }
  }

  return [...visible, last];
}

/**
 * One running total drawn against time: each point sits at when it happened, and the line starts
 * at break-even at the first point's time. Points that all share one time spread evenly instead.
 * `nearest` reads which point an x position is closest to, for dragging along the line.
 */
export const runningLine = (
  points: ReadonlyArray<{ readonly at: number; readonly total: number }>,
  size: { readonly width: number; readonly height: number },
  pad: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
) => {
  const scale = lineScale([[0, ...points.map((point) => point.total)]], size, pad);
  const first = points[0]?.at ?? 0;
  const span = (points.at(-1)?.at ?? first) - first;
  const across = size.width - 2 * pad.x;

  const xs = points.map(
    (point, i) =>
      pad.x +
      (span > 0 ? (point.at - first) / span : points.length <= 1 ? 0 : i / (points.length - 1)) *
        across,
  );

  const placed = points.map((point, i) => ({ x: xs[i]!, y: scale.y(point.total) }));
  const line = [{ x: pad.x, y: scale.zero }, ...placed];
  const end = line.at(-1)!;

  return {
    zero: scale.zero,
    points: placed,
    line: line.map((p) => `${p.x},${p.y}`).join(" "),
    area: `M${pad.x} ${scale.zero} ${line.map((p) => `L${p.x} ${p.y}`).join(" ")} L${end.x} ${scale.zero} Z`,
    nearest: (x: number) => {
      let best = 0;

      for (let i = 1; i < xs.length; i++)
        if (Math.abs(xs[i]! - x) < Math.abs(xs[best]! - x)) best = i;

      return best;
    },
  };
};

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
    /** 1 when the value runs off the top, -1 off the bottom, 0 when it's on the plot. */
    clipped: (value: number) => (value > high ? 1 : value < low ? -1 : 0),
    points: (values: ReadonlyArray<number>) => values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
  };
};

/** The lines worth fitting a race plot around: the one at `index` and its neighbours on the board. */
export const around = (index: number, count: number) =>
  [index - 1, index, index + 1].filter((i) => i >= 0 && i < count);

/**
 * Label positions for the ends of lines, nudged apart so no two sit closer than `gap`, kept in
 * their original order and inside [min, max] while there's room. Returned in input order.
 */
export const spreadLabels = (
  ys: ReadonlyArray<number>,
  gap: number,
  bounds: { readonly min: number; readonly max: number },
) => {
  const order = ys.map((y, i) => ({ y, i })).toSorted((a, b) => a.y - b.y || a.i - b.i);
  const placed = order.map((o) => o.y);
  for (let k = 0; k < placed.length; k++)
    placed[k] = Math.max(placed[k]!, k === 0 ? bounds.min : placed[k - 1]! + gap);
  for (let k = placed.length - 1; k >= 0; k--)
    placed[k] = Math.min(placed[k]!, k === placed.length - 1 ? bounds.max : placed[k + 1]! - gap);
  const out = Array.from({ length: ys.length }, () => 0);
  order.forEach((o, k) => (out[o.i] = placed[k]!));
  return out;
};

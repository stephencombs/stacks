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
 */
export const lineScale = (
  series: ReadonlyArray<ReadonlyArray<number>>,
  size: { readonly width: number; readonly height: number },
  pad: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
) => {
  let low = 0;
  let high = 0;

  for (const values of series)
    for (const value of values) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }

  const count = Math.max(0, ...series.map((values) => values.length));
  const span = high - low || 1;
  const x = (i: number) => pad.x + (count <= 1 ? 0 : i / (count - 1)) * (size.width - 2 * pad.x);
  const y = (value: number) => pad.y + ((high - value) / span) * (size.height - 2 * pad.y);

  return {
    x,
    y,
    zero: y(0),
    points: (values: ReadonlyArray<number>) => values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
  };
};

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

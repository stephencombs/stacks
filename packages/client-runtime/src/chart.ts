/**
 * A track for bars that grow from break-even: where zero sits and how much of the track a value
 * covers, both as fractions. The largest magnitude fills its side exactly.
 */
export const barTrack = (values: Iterable<number>) => {
  let low = 0;
  let high = 0;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const span = high - low || 1;
  return { zero: (0 - low) / span, extent: (value: number) => Math.abs(value) / span };
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
  let count = 0;
  for (const values of series) {
    count = Math.max(count, values.length);
    for (const value of values) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
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

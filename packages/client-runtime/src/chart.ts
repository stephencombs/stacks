/** A value axis for running totals, in minor units. */
export interface NetScale {
  readonly min: number;
  readonly max: number;
  /** Round-numbered tick values from `min` to `max`, evenly spaced. */
  readonly ticks: ReadonlyArray<number>;
}

/**
 * An axis that covers every value and zero, so the break-even line is always on the chart, with
 * about `count` steps of 1, 2 or 5 times a power of ten.
 */
export const netScale = (values: Iterable<number>, count = 4): NetScale => {
  let low = 0;
  let high = 0;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (low === high) high = 100;

  const raw = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(nice * magnitude));

  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: Array<number> = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
};

/** How far down the axis a value sits: 0 at `max`, 1 at `min`. */
export const fromTop = (value: number, scale: NetScale) =>
  (scale.max - value) / (scale.max - scale.min);

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

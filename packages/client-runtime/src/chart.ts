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

export type ScrollMetrics = {
  readonly offsetY: number;
  readonly layoutHeight: number;
  readonly scrolled: boolean;
};

/**
 * For `contentInsetAdjustmentBehavior="never"` scroll views (`minOffset === 0`), returns the
 * clamped offset when dynamic content shrinks below the current scroll position, or `null` when
 * the offset is still within bounds.
 */
export function clampedScrollOffset(metrics: ScrollMetrics, contentHeight: number) {
  if (!metrics.scrolled || metrics.layoutHeight <= 0) return null;
  const maxOffset = Math.max(0, contentHeight - metrics.layoutHeight);

  return metrics.offsetY > maxOffset ? maxOffset : null;
}

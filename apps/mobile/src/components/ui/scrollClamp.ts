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

/**
 * Where to scroll to bring content back under a native bar that insets it, or `null` when it is
 * already at or above that spot. The rest offset of an inset scroll view is `-headerHeight`, not 0.
 */
export function offsetBelowHeader(offsetY: number, headerHeight: number) {
  return offsetY > -headerHeight ? -headerHeight : null;
}

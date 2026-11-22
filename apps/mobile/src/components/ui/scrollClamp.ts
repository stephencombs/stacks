export type ScrollMetrics = {
  readonly offsetY: number;
  readonly insetTop: number;
  readonly insetBottom: number;
  readonly layoutHeight: number;
  readonly scrolled: boolean;
};

/**
 * When dynamic content (such as filtered Stats) shrinks while scrolled down, iOS `UIScrollView`
 * with `alwaysBounceVertical={false}` can strand the viewport past the new bottom and lock
 * scrolling. Returns the offset to clamp back to, or `null` when the current offset is still valid.
 */
export function clampedScrollOffset(metrics: ScrollMetrics, contentHeight: number) {
  if (!metrics.scrolled || metrics.layoutHeight <= 0) return null;
  const minOffset = -metrics.insetTop;
  const maxOffset = Math.max(minOffset, contentHeight + metrics.insetBottom - metrics.layoutHeight);

  return metrics.offsetY > maxOffset ? maxOffset : null;
}

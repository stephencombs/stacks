/**
 * How far the visual viewport's bottom sits above the layout viewport.
 * A docked keyboard opens that gap; browser chrome only moves it a little,
 * and a browser that already resized the layout viewport reports no gap.
 */
export function visualKeyboardOverlap(
  innerHeight: number,
  viewportHeight: number,
  offsetTop: number,
) {
  const overlap = Math.round(innerHeight - viewportHeight - offsetTop);
  return overlap >= 80 ? overlap : 0;
}

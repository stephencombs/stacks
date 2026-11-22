export function chartCurve(points: ReadonlyArray<{ x: number; y: number }>) {
  return points
    .map((point, index) => {
      const previous = points[index - 1];

      if (!previous) return `M${point.x} ${point.y}`;

      const middle = (previous.x + point.x) / 2;

      return `C${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
    })
    .join(" ");
}

import { Host } from "@expo/ui/jetpack-compose";
import type { MaterialColors } from "@expo/ui/jetpack-compose";
import { useCSSVariable, useUniwind } from "uniwind";

type HostProps = Parameters<typeof Host>[0];

/**
 * Every Jetpack Compose control sits in one of these, and nothing else themes one. Compose paints
 * from Material's color roles, which default to the device's wallpaper palette (the lavender and
 * teal of stock Android), so every role a control can read is set from the app's tokens here.
 * Host turns each token into the color it needs; `colorOverrides` is typed for hex strings only.
 */
export function ComposeHost(props: HostProps) {
  const { theme } = useUniwind();
  const [ink, inverse, canvas, surface, fill, strong, muted, faint, line, scrim, loss] =
    useCSSVariable([
      "--color-ink",
      "--color-ink-inverse",
      "--color-canvas",
      "--color-surface",
      "--color-fill",
      "--color-fill-strong",
      "--color-muted",
      "--color-faint",
      "--color-line",
      "--color-scrim",
      "--color-loss",
    ]);
  const roles = {
    primary: ink,
    onPrimary: inverse,
    primaryContainer: strong,
    onPrimaryContainer: ink,
    inversePrimary: faint,
    secondary: ink,
    onSecondary: inverse,
    secondaryContainer: strong,
    onSecondaryContainer: ink,
    tertiary: ink,
    onTertiary: inverse,
    tertiaryContainer: strong,
    onTertiaryContainer: ink,
    background: canvas,
    onBackground: ink,
    surface,
    onSurface: ink,
    surfaceVariant: fill,
    onSurfaceVariant: muted,
    surfaceTint: surface,
    surfaceBright: surface,
    surfaceDim: canvas,
    surfaceContainerLowest: canvas,
    surfaceContainerLow: surface,
    surfaceContainer: surface,
    surfaceContainerHigh: surface,
    surfaceContainerHighest: surface,
    inverseSurface: ink,
    inverseOnSurface: inverse,
    outline: faint,
    outlineVariant: line,
    scrim,
    error: loss,
    onError: inverse,
    errorContainer: fill,
    onErrorContainer: loss,
  };
  return (
    <Host
      colorScheme={theme === "dark" ? "dark" : "light"}
      colorOverrides={roles as Partial<MaterialColors>}
      {...props}
    />
  );
}

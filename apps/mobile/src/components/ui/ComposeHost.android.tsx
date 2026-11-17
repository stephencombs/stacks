import { Host } from "@expo/ui/jetpack-compose";
import { useCSSVariable, useUniwind } from "uniwind";

type HostProps = Parameters<typeof Host>[0];
type Hex = `#${string}`;

const hex = (value: unknown, fallback: Hex): Hex => {
  const text = String(value);
  if (!text.startsWith("#")) return fallback;
  return (text.length === 7 ? `${text}ff` : text) as Hex;
};

/**
 * Every Jetpack Compose control sits in one of these. Compose paints from Material's color
 * roles, which default to the device's wallpaper palette (the lavender and teal of stock
 * Android), so the roles are set from the app's tokens and nothing leaks through.
 */
export function ComposeHost(props: HostProps) {
  const { theme } = useUniwind();
  const [ink, inverse, canvas, surface, fill, strong, muted, faint, loss] = useCSSVariable([
    "--color-ink",
    "--color-ink-inverse",
    "--color-canvas",
    "--color-surface",
    "--color-fill",
    "--color-fill-strong",
    "--color-muted",
    "--color-faint",
    "--color-loss",
  ]);
  const dark = theme === "dark";
  const base = {
    ink: hex(ink, dark ? "#ffffffff" : "#111114ff"),
    inverse: hex(inverse, dark ? "#000000ff" : "#ffffffff"),
    canvas: hex(canvas, dark ? "#000000ff" : "#f2f2f6ff"),
    surface: hex(surface, dark ? "#1c1c1eff" : "#ffffffff"),
    fill: hex(fill, dark ? "#2c2c2eff" : "#ececf1ff"),
    strong: hex(strong, dark ? "#3a3a3cff" : "#dcdce2ff"),
    muted: hex(muted, "#6b6b75ff"),
    faint: hex(faint, "#9a9aa4ff"),
    loss: hex(loss, "#ce1e13ff"),
  };
  return (
    <Host
      colorScheme={dark ? "dark" : "light"}
      colorOverrides={{
        primary: base.ink,
        onPrimary: base.inverse,
        primaryContainer: base.strong,
        onPrimaryContainer: base.ink,
        inversePrimary: base.faint,
        secondary: base.ink,
        onSecondary: base.inverse,
        secondaryContainer: base.strong,
        onSecondaryContainer: base.ink,
        tertiary: base.ink,
        onTertiary: base.inverse,
        tertiaryContainer: base.strong,
        onTertiaryContainer: base.ink,
        background: base.canvas,
        onBackground: base.ink,
        surface: base.surface,
        onSurface: base.ink,
        surfaceVariant: base.fill,
        onSurfaceVariant: base.muted,
        surfaceTint: base.surface,
        inverseSurface: base.ink,
        inverseOnSurface: base.inverse,
        error: base.loss,
        onError: base.inverse,
      }}
      {...props}
    />
  );
}

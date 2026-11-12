import {
  ArrowRight,
  Check,
  ChartLine,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Club,
  CloudCheck,
  CloudOff,
  CloudUpload,
  Delete,
  Download,
  Ellipsis,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react-native";
import { useCSSVariable } from "uniwind";

const icons = {
  alert: CircleAlert,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  more: Ellipsis,
  check: Check,
  "arrow-right": ArrowRight,
  close: X,
  delete: Delete,
  "cloud-check": CloudCheck,
  "cloud-upload": CloudUpload,
  "cloud-off": CloudOff,
  sessions: Club,
  board: ChartLine,
  group: Users,
  plus: Plus,
  search: Search,
  filter: SlidersHorizontal,
  settings: Settings,
  download: Download,
  sparkles: Sparkles,
};

export type IconName = keyof typeof icons;
export type IconColor =
  | "ink"
  | "muted"
  | "faint"
  | "accent-ink"
  | "accent-text"
  | "danger"
  | "live"
  | "win"
  | "loss";

/** A decorative icon in a palette color; lucide here, SF Symbols on iOS (`Icon.ios.tsx`). */
export function Icon({
  name,
  color,
  size = 20,
  filled = false,
}: {
  name: IconName;
  color: IconColor;
  size?: number;
  filled?: boolean;
}) {
  const Glyph = icons[name];
  const tint = useCSSVariable(`--color-${color}`);
  return (
    <Glyph
      size={size}
      color={String(tint)}
      strokeWidth={filled ? 2.5 : 2}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

import {
  ArrowRight,
  Check,
  ChartColumn,
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
  MapPinned,
  Plus,
  Pencil,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  UserPlus,
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
  stats: ChartColumn,
  map: MapPinned,
  plus: Plus,
  edit: Pencil,
  search: Search,
  filter: SlidersHorizontal,
  settings: Settings,
  download: Download,
  sparkles: Sparkles,
  "add-person": UserPlus,
  person: User,
  share: Share2,
  trash: Trash2,
};

export type IconName = keyof typeof icons;
export type IconColor =
  | "ink"
  | "ink-inverse"
  | "muted"
  | "faint"
  | "live"
  | "win"
  | "loss"
  | "felt-soft";

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

import {
  ArrowRight,
  Calendar,
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
  EllipsisVertical,
  EyeOff,
  Link2,
  Map,
  Plane,
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
  "more-vertical": EllipsisVertical,
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
  map: Map,
  trip: Plane,
  link: Link2,
  plus: Plus,
  edit: Pencil,
  search: Search,
  filter: SlidersHorizontal,
  settings: Settings,
  download: Download,
  "eye-off": EyeOff,
  sparkles: Sparkles,
  "add-person": UserPlus,
  person: User,
  share: Share2,
  trash: Trash2,
  calendar: Calendar,
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
  | "chip-orange"
  | "felt-soft"
  | "felt-ink";

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

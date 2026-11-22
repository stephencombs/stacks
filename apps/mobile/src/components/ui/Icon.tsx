import ArrowRight from "lucide-react-native/icons/arrow-right";
import Calendar from "lucide-react-native/icons/calendar";
import ChartColumn from "lucide-react-native/icons/chart-column";
import ChartLine from "lucide-react-native/icons/chart-line";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CloudCheck from "lucide-react-native/icons/cloud-check";
import CloudOff from "lucide-react-native/icons/cloud-off";
import CloudUpload from "lucide-react-native/icons/cloud-upload";
import Club from "lucide-react-native/icons/club";
import Delete from "lucide-react-native/icons/delete";
import Download from "lucide-react-native/icons/download";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import EyeOff from "lucide-react-native/icons/eye-off";
import Link2 from "lucide-react-native/icons/link-2";
import Map from "lucide-react-native/icons/map";
import Pencil from "lucide-react-native/icons/pencil";
import Plane from "lucide-react-native/icons/plane";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import Share2 from "lucide-react-native/icons/share-2";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Sparkles from "lucide-react-native/icons/sparkles";
import Trash2 from "lucide-react-native/icons/trash-2";
import User from "lucide-react-native/icons/user";
import UserPlus from "lucide-react-native/icons/user-plus";
import Users from "lucide-react-native/icons/users";
import X from "lucide-react-native/icons/x";
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

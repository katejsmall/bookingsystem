import {
  BarChart3,
  FileText,
  Home,
  Image as ImageIcon,
  MessageCircle,
  PenLine,
  Settings,
  Users,
} from "lucide-react";

/** One icon per exhibitor sidebar nav item, keyed by route segment. */
export const NAV_ICONS = {
  dashboard: Home,
  "lineup-trailers": FileText,
  bookings: PenLine,
  "title-requests": MessageCircle,
  performance: BarChart3,
  "marketing-assets": ImageIcon,
  correspondence: MessageCircle,
  users: Users,
  settings: Settings,
} as const;

export type NavKey = keyof typeof NAV_ICONS;

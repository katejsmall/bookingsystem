import {
  Building2,
  CalendarDays,
  Clapperboard,
  Film,
  FileSignature,
  Home,
  Inbox,
  Lightbulb,
  MonitorPlay,
} from "lucide-react";

/** One icon per team sidebar nav item, keyed by a stable nav key. */
export const NAV_ICONS = {
  home: Home,
  calendar: CalendarDays,
  requests: Inbox,
  "production-requests": Clapperboard,
  exhibitors: Building2,
  screens: MonitorPlay,
  lineup: Film,
  "tbd-titles": Lightbulb,
  contracts: FileSignature,
} as const;

export type NavKey = keyof typeof NAV_ICONS;

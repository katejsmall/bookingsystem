"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarView } from "@/components/CalendarView";
import { RequestForm } from "@/components/RequestForm";
import { MyRequests } from "@/components/MyRequests";
import { TrailerCatalogue } from "@/components/exhibitor/TrailerCatalogue";
import type { BookingVM, TrailerAsset, TrailerRequestWithAsset } from "@/lib/types";

type ScreenOpt = { screenUnique: string; label: string; screenFormat: string | null };
type TitleOpt = { lineupId: number; titleNo: string; format: string; releaseDate: string | null; name: string };
type ExistingBooking = { titleNo: string | null; date: string; screenUnique: string };
type CalendarScreenOpt = {
  screen_unique: string;
  exhibitor_id: string | null;
  site_name: string | null;
  screen_name: string | null;
  screen_format: string | null;
};
type ExhibitorOpt = { exhibitor_unique: string; name: string; country: string; accountManager: string | null };

const TABS = [
  { key: "request", label: "Request" },
  { key: "calendar", label: "Calendar View" },
  { key: "table", label: "Table View" },
  { key: "trailers", label: "Trailers" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function BookingsView({
  bookings,
  screens,
  titles,
  existing,
  calendarScreens,
  exhibitors,
  trailerAssets,
  myTrailerRequests,
}: {
  bookings: BookingVM[];
  screens: ScreenOpt[];
  titles: TitleOpt[];
  existing: ExistingBooking[];
  calendarScreens: CalendarScreenOpt[];
  exhibitors: ExhibitorOpt[];
  trailerAssets: TrailerAsset[];
  myTrailerRequests: TrailerRequestWithAsset[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "calendar";
  const titleParam = searchParams.get("title") ?? undefined;

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "request" && (
        <div className="max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-bold tracking-tight">Request a play date</h2>
            <p className="mt-1 text-sm text-muted">
              Pick a title, choose the formats you want it in, and we&apos;ll send it to the CJ
              4DPLEX team to confirm.
            </p>
          </div>
          <RequestForm
            screens={screens}
            titles={titles}
            existing={existing}
            preselectedTitleNo={titleParam}
          />
        </div>
      )}

      {activeTab === "calendar" && (
        <CalendarZoomTabs>
          <CalendarView
            bookings={bookings}
            screens={calendarScreens}
            exhibitors={exhibitors}
            isTeam={false}
          />
        </CalendarZoomTabs>
      )}

      {activeTab === "table" && <MyRequests bookings={bookings} />}

      {activeTab === "trailers" && (
        <TrailerCatalogue assets={trailerAssets} myRequests={myTrailerRequests} />
      )}
    </div>
  );
}

const ZOOMS = ["Monthly", "Weekly", "Annual"] as const;

function CalendarZoomTabs({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>("Monthly");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-xs font-medium">
          {ZOOMS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded-full px-3 py-1 uppercase tracking-wide transition ${
                zoom === z ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted">
          <LegendDot className="bg-confirmed" label="Confirmed" />
          <LegendDot className="bg-requested" label="Booking Requested" />
        </div>
      </div>

      {zoom === "Monthly" ? (
        children
      ) : (
        <p className="py-16 text-center text-sm text-muted">{zoom} view is coming soon.</p>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NAV_ICONS, type NavKey } from "@/components/exhibitor/icons";
import type { FormatMix } from "@/lib/theme";

const NAV: { href: string; key: NavKey; label: string }[] = [
  { href: "/dashboard", key: "dashboard", label: "Dashboard" },
  { href: "/lineup-trailers", key: "lineup-trailers", label: "Lineup & Trailers" },
  { href: "/bookings", key: "bookings", label: "Bookings" },
  { href: "/title-requests", key: "title-requests", label: "Title Requests" },
  { href: "/performance", key: "performance", label: "Performance" },
  { href: "/marketing-assets", key: "marketing-assets", label: "Marketing Assets" },
  { href: "/correspondence", key: "correspondence", label: "Correspondence" },
  { href: "/users", key: "users", label: "My Users" },
  { href: "/settings", key: "settings", label: "Settings" },
];

export function ExhibitorShell({
  exhibitorName,
  email,
  gradient,
  formatMix,
  children,
}: {
  exhibitorName: string;
  email: string | undefined;
  gradient: string;
  formatMix: FormatMix;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div
      className="flex min-h-screen p-3 gap-3"
      data-portal="exhibitor"
      style={{ backgroundImage: gradient }}
    >
      <aside className="w-60 shrink-0 flex flex-col text-white">
        <div className="px-3 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-6">
            {formatMix !== "screenx" && (
              <Image
                src="/4dx-logo-black.png"
                alt="4DX"
                width={2000}
                height={805}
                className="h-4 w-auto brightness-0 invert"
              />
            )}
            {formatMix !== "4dx" && (
              <Image
                src="/screenx-logo-black.png"
                alt="ScreenX"
                width={2800}
                height={500}
                className="h-3.5 w-auto brightness-0 invert"
              />
            )}
          </div>
          <h1 className="text-xl font-bold leading-tight">
            Welcome
            <br />
            {exhibitorName}!
          </h1>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-wide uppercase text-[11px] transition ${
                  active ? "bg-black/30" : "hover:bg-white/10 text-white/85"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/15 text-white/70">
          <p className="text-xs truncate">{email}</p>
          <form action={logout}>
            <button className="text-xs underline hover:text-white transition mt-1">
              Sign out
            </button>
          </form>
          <p className="text-[10px] mt-4 opacity-60">
            Copyright(c) CJ 4DPLEX. All rights reserved
          </p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto bg-surface text-foreground rounded-3xl shadow-2xl">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

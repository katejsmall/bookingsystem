"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NAV_ICONS, type NavKey } from "@/components/team/icons";
import { TeamScopeSelector } from "@/components/team/TeamScopeSelector";
import { isAllScope } from "@/lib/teamScope";

type NavItem = { href: string; key: NavKey; label: string; badge?: number };

export function TeamShell({
  fullName,
  email,
  scope,
  managers,
  pendingCount,
  productionPendingCount,
  trailerPendingCount,
  children,
}: {
  fullName: string;
  email: string | undefined;
  scope: string;
  managers: string[];
  pendingCount: number;
  productionPendingCount: number;
  trailerPendingCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const primary: NavItem[] = [
    { href: "/home", key: "home", label: "Home" },
    { href: "/requests", key: "requests", label: "Requests", badge: pendingCount },
    { href: "/calendar", key: "calendar", label: "Calendar" },
    {
      href: "/production-requests",
      key: "production-requests",
      label: "Production",
      badge: productionPendingCount,
    },
    {
      href: "/trailer-requests",
      key: "trailer-requests",
      label: "Trailers",
      badge: trailerPendingCount,
    },
  ];
  // Contacts live inside Exhibitors now - an exhibitor and its people are
  // one CRM record, not two menu items.
  const crm: NavItem[] = [
    { href: "/crm/exhibitors", key: "exhibitors", label: "Exhibitors" },
    { href: "/crm/screens", key: "screens", label: "Screens" },
    { href: "/crm/lineup", key: "lineup", label: "Lineup" },
    { href: "/crm/tbd-titles", key: "tbd-titles", label: "TBD Titles" },
    { href: "/crm/contracts", key: "contracts", label: "Contracts" },
  ];

  const renderItem = (item: NavItem) => {
    const Icon = NAV_ICONS[item.key];
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
          active ? "bg-black/30 text-white" : "text-white/85 hover:bg-white/10"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="flex-1">{item.label}</span>
        {!!item.badge && (
          <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-black">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div
      className="flex min-h-screen gap-3 p-3"
      data-portal="team"
      style={{ backgroundImage: "var(--gradient-blend)" }}
    >
      {/* The gradient runs to orange, where plain white nav text drops to
          ~2.9:1. A soft dark scrim keeps the sidebar legible wherever the
          gradient happens to land behind it. */}
      <aside className="relative flex w-60 shrink-0 flex-col rounded-2xl bg-black/25 text-white">
        <div className="px-3 pt-5 pb-4">
          <div className="mb-5 flex items-center gap-3">
            <Image
              src="/4dx-logo-black.png"
              alt="4DX"
              width={2000}
              height={805}
              className="h-4 w-auto brightness-0 invert"
            />
            <Image
              src="/screenx-logo-black.png"
              alt="ScreenX"
              width={2800}
              height={500}
              className="h-3.5 w-auto brightness-0 invert"
            />
          </div>
          {/* Greets whoever's territory is selected, so the header always
              matches the data on screen. */}
          <h1 className="text-xl font-bold leading-tight">
            {isAllScope(scope) ? `Welcome ${fullName}!` : `Welcome ${scope}!`}
          </h1>
          <p className="mt-0.5 text-xs text-white/70">
            {isAllScope(scope) ? "All territories" : "CJ 4DPLEX Programming Team"}
          </p>
        </div>

        <div className="pb-3">
          <TeamScopeSelector scope={scope} managers={managers} />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {primary.map(renderItem)}
          <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
            Manage
          </p>
          {crm.map(renderItem)}
        </nav>

        <div className="border-t border-white/15 px-4 py-4 text-white/70">
          <p className="truncate text-xs">{email}</p>
          <form action={logout}>
            <button className="mt-1 text-xs underline transition hover:text-white">
              Sign out
            </button>
          </form>
          <p className="mt-4 text-[10px] opacity-60">
            Copyright(c) CJ 4DPLEX. All rights reserved
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto rounded-3xl bg-surface text-foreground shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)]">
        <div className="px-7 py-6">{children}</div>
      </main>
    </div>
  );
}

"use client";

import { type ReactNode } from "react";
import type { BookingStatus } from "@/lib/types";

export function FormatBadge({ format }: { format: string }) {
  const styles: Record<string, string> = {
    "4DX": "bg-fourdx/10 text-fourdx border-fourdx/30",
    ScreenX: "bg-screenx/10 text-screenx border-screenx/30",
    Ultra4DX: "bg-fourdx/10 text-fourdx border-fourdx/40",
    UltraScreenX: "bg-screenx/10 text-screenx border-screenx/40",
  };
  const label = format === "Ultra4DX" ? "ULTRA 4DX" : format === "UltraScreenX" ? "ULTRA ScreenX" : format;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${styles[format] ?? "bg-foreground/5 text-muted border-line"}`}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const styles: Record<BookingStatus, string> = {
    confirmed: "bg-confirmed/10 text-confirmed border-confirmed/30",
    requested: "bg-requested/10 text-requested border-requested/40 border-dashed",
    rejected: "bg-foreground/5 text-muted border-line",
    cancelled: "bg-foreground/5 text-muted border-line",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40 min-w-32"
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 p-4 pt-16 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg bg-surface border border-line shadow-xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10";

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 transition"
    >
      {children}
    </button>
  );
}

export function SubtleButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50 transition"
    >
      {children}
    </button>
  );
}

/* --- Exhibitor-portal pill/glass primitives --------------------------- */
/* Additive variants for the dark-gradient exhibitor UI; the square/light
   primitives above are unchanged and keep serving the team side. */

export const pillInputCls =
  "w-full rounded-full border border-glass-border bg-glass px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 backdrop-blur-sm";

export function PillPrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 transition"
    >
      {children}
    </button>
  );
}

export function PillSubtleButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-full border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/10 disabled:opacity-50 transition backdrop-blur-sm"
    >
      {children}
    </button>
  );
}

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-glass-border bg-glass backdrop-blur-xl shadow-2xl ${className}`}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

/** katedashboard KPI tile: 11px label, 27px figure, 11px sub-line. */
export function KpiTile({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  sub?: ReactNode;
  tone?: "good" | "warn" | "crit";
  href?: string;
}) {
  const toneCls =
    tone === "crit"
      ? "text-crit"
      : tone === "warn"
        ? "text-warn"
        : tone === "good"
          ? "text-good"
          : "";

  const body = (
    <>
      <p className="text-[11px] text-ink2">{label}</p>
      <p className={`num mt-1 text-[27px] font-semibold leading-none tracking-[-0.02em] ${toneCls}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-muted">{sub}</p>}
    </>
  );

  const cls =
    "block rounded-[14px] border border-line bg-surface px-[18px] py-4 transition";

  return href ? (
    <a href={href} className={`${cls} hover:border-baseline`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The responsive tile row wrapper (auto-fit, min 190px). */
export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
      {children}
    </div>
  );
}

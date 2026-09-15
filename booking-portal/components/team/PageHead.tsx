import type { ReactNode } from "react";

/**
 * The katedashboard page header: big title + muted subtitle on the left,
 * page-level controls right-aligned. Used at the top of every team page.
 */
export function PageHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[23px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-ink2">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-end gap-2">{children}</div>}
    </div>
  );
}

/** Small uppercase label that heads a section within a page. */
export function SectionHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink2">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

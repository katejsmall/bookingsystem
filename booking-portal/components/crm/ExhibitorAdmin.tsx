"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveExhibitor } from "@/app/actions/crm";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, Modal, PrimaryButton, SubtleButton, inputCls } from "@/components/ui";
import type { Exhibitor } from "@/lib/types";

export function ExhibitorAdmin({
  exhibitors,
  logoUrls,
}: {
  exhibitors: Exhibitor[];
  logoUrls: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Exhibitor | "add" | null>(null);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return exhibitors.filter(
      (e) =>
        !q ||
        e.exhibitor_erp?.toLowerCase().includes(q) ||
        e.exhibitor_unique.toLowerCase().includes(q) ||
        e.entity_country?.toLowerCase().includes(q) ||
        e.manager_email?.toLowerCase().includes(q) ||
        e.account_manager?.toLowerCase().includes(q)
    );
  }, [exhibitors, search]);

  const knownManagers = useMemo(
    () => [...new Set(exhibitors.map((e) => e.account_manager).filter((m): m is string => !!m))].sort(),
    [exhibitors]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exhibitors…"
          className={`${inputCls} max-w-xs`}
        />
        <PrimaryButton onClick={() => setEditing("add")}>Add exhibitor</PrimaryButton>
        <p className="ml-auto text-xs text-muted">{rows.length} of {exhibitors.length}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Exhibitor</th>
              <th className="px-4 py-2.5 font-medium">ID</th>
              <th className="px-4 py-2.5 font-medium">Country</th>
              <th className="px-4 py-2.5 font-medium">4DX</th>
              <th className="px-4 py-2.5 font-medium">ScreenX</th>
              <th className="px-4 py-2.5 font-medium">ULTRA 4DX</th>
              <th className="px-4 py-2.5 font-medium">Manager email</th>
              <th className="px-4 py-2.5 font-medium">Account manager</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.exhibitor_unique} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {e.logo_path && logoUrls[e.logo_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL
                      <img src={logoUrls[e.logo_path]} alt="" className="h-7 w-7 rounded object-contain" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded bg-foreground/10 text-[10px] font-bold text-muted">
                        {(e.exhibitor_erp ?? e.exhibitor_unique).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium">{e.exhibitor_erp ?? "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{e.exhibitor_unique}</td>
                <td className="px-4 py-2.5">{e.entity_country ?? "—"}</td>
                <td className="px-4 py-2.5">{e["4dx"] ? "✓" : "—"}</td>
                <td className="px-4 py-2.5">{e.screenx ? "✓" : "—"}</td>
                <td className="px-4 py-2.5">{e.ultra4dx ? "✓" : "—"}</td>
                <td className="px-4 py-2.5 text-muted">{e.manager_email ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{e.account_manager ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <SubtleButton onClick={() => setEditing(e)}>Edit</SubtleButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ExhibitorForm
          exhibitor={editing === "add" ? null : editing}
          onClose={() => setEditing(null)}
          knownManagers={knownManagers}
        />
      )}
    </div>
  );
}

function ExhibitorForm({
  exhibitor,
  onClose,
  knownManagers,
}: {
  exhibitor: Exhibitor | null;
  onClose: () => void;
  knownManagers: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveExhibitor,
    null
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal title={exhibitor ? `Edit ${exhibitor.exhibitor_erp ?? exhibitor.exhibitor_unique}` : "Add exhibitor"} onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="mode" value={exhibitor ? "edit" : "add"} />
        <Field label="Exhibitor ID (e.g. EX10123)">
          <input
            name="exhibitor_unique"
            required
            defaultValue={exhibitor?.exhibitor_unique}
            readOnly={!!exhibitor}
            className={`${inputCls} ${exhibitor ? "bg-foreground/5 text-muted" : ""}`}
          />
        </Field>
        <Field label="Name (ERP)">
          <input name="exhibitor_erp" defaultValue={exhibitor?.exhibitor_erp ?? ""} className={inputCls} />
        </Field>
        <Field label="Exhibitor key">
          <input name="exhibitor_key" defaultValue={exhibitor?.exhibitor_key ?? ""} className={inputCls} />
        </Field>
        <Field label="Country">
          <input name="entity_country" defaultValue={exhibitor?.entity_country ?? ""} className={inputCls} />
        </Field>
        <Field label="Manager email">
          <input type="email" name="manager_email" defaultValue={exhibitor?.manager_email ?? ""} className={inputCls} />
        </Field>
        <Field label="Account manager (CJ team)">
          <input
            name="account_manager"
            list="account-manager-options"
            defaultValue={exhibitor?.account_manager ?? ""}
            placeholder="e.g. Frankie Crane"
            className={inputCls}
          />
          <datalist id="account-manager-options">
            {knownManagers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <div className="flex gap-5 pt-1 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="4dx" defaultChecked={!!exhibitor?.["4dx"]} /> 4DX
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="screenx" defaultChecked={!!exhibitor?.screenx} /> ScreenX
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="ultra4dx" defaultChecked={!!exhibitor?.ultra4dx} /> ULTRA 4DX
          </label>
        </div>
        {state && !state.ok && <p className="text-sm text-error">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <SubtleButton type="button" onClick={onClose}>Cancel</SubtleButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

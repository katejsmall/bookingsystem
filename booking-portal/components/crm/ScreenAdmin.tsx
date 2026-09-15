"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveScreen } from "@/app/actions/crm";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, FormatBadge, Modal, PrimaryButton, Select, SubtleButton, inputCls } from "@/components/ui";
import { FORMATS, type Screen } from "@/lib/types";

type ExhibitorOpt = { exhibitor_unique: string; name: string };

export function ScreenAdmin({
  screens,
  exhibitors,
}: {
  screens: Screen[];
  exhibitors: ExhibitorOpt[];
}) {
  const [exhibitor, setExhibitor] = useState("");
  const [country, setCountry] = useState("");
  const [format, setFormat] = useState("");
  const [editing, setEditing] = useState<Screen | "add" | null>(null);

  const exhibitorName = useMemo(
    () => new Map(exhibitors.map((e) => [e.exhibitor_unique, e.name])),
    [exhibitors]
  );
  const countries = useMemo(
    () => [...new Set(screens.map((s) => s.location_country).filter((c): c is string => !!c))].sort(),
    [screens]
  );

  const rows = useMemo(
    () =>
      screens.filter(
        (s) =>
          (!exhibitor || s.exhibitor_id === exhibitor) &&
          (!country || s.location_country === country) &&
          (!format || s.screen_format === format)
      ),
    [screens, exhibitor, country, format]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Exhibitor"
          value={exhibitor}
          onChange={setExhibitor}
          options={exhibitors.map((e) => ({ value: e.exhibitor_unique, label: e.name }))}
          allLabel="All exhibitors"
        />
        <Select
          label="Country"
          value={country}
          onChange={setCountry}
          options={countries.map((c) => ({ value: c, label: c }))}
          allLabel="All countries"
        />
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          allLabel="All formats"
        />
        <PrimaryButton onClick={() => setEditing("add")}>Add screen</PrimaryButton>
        <p className="ml-auto pb-2 text-xs text-muted">{rows.length} of {screens.length}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Site</th>
              <th className="px-4 py-2.5 font-medium">Screen</th>
              <th className="px-4 py-2.5 font-medium">Exhibitor</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Format</th>
              <th className="px-4 py-2.5 font-medium">Seats</th>
              <th className="px-4 py-2.5 font-medium">Opened</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.screen_unique} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">{s.site_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">
                  {[s.screen_name, s.screen_number].filter(Boolean).join(" #") || "—"}
                </td>
                <td className="px-4 py-2.5">{exhibitorName.get(s.exhibitor_id ?? "") ?? s.exhibitor_id ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">
                  {[s.location_city, s.location_country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5">
                  {s.screen_format ? <FormatBadge format={s.screen_format} /> : "—"}
                </td>
                <td className="px-4 py-2.5 text-muted">{s.seat_count ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{s.opening_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <SubtleButton onClick={() => setEditing(s)}>Edit</SubtleButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ScreenForm
          screen={editing === "add" ? null : editing}
          exhibitors={exhibitors}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ScreenForm({
  screen,
  exhibitors,
  onClose,
}: {
  screen: Screen | null;
  exhibitors: ExhibitorOpt[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveScreen,
    null
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal title={screen ? `Edit ${screen.screen_unique}` : "Add screen"} onClose={onClose} wide>
      <form action={formAction} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="mode" value={screen ? "edit" : "add"} />
        {screen && <input type="hidden" name="screen_unique" value={screen.screen_unique} />}
        <Field label="Exhibitor">
          <select name="exhibitor_id" required defaultValue={screen?.exhibitor_id ?? ""} className={inputCls}>
            <option value="">Choose…</option>
            {exhibitors.map((e) => (
              <option key={e.exhibitor_unique} value={e.exhibitor_unique}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site name">
          <input name="site_name" required defaultValue={screen?.site_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Screen name">
          <input name="screen_name" defaultValue={screen?.screen_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Screen number">
          <input name="screen_number" defaultValue={screen?.screen_number ?? ""} className={inputCls} />
        </Field>
        <Field label="City">
          <input name="location_city" defaultValue={screen?.location_city ?? ""} className={inputCls} />
        </Field>
        <Field label="Country">
          <input name="location_country" defaultValue={screen?.location_country ?? ""} className={inputCls} />
        </Field>
        <Field label="Format (marketing label)">
          <input name="format" defaultValue={screen?.format ?? ""} className={inputCls} />
        </Field>
        <Field label="Screen format (must match lineup format)">
          <select name="screen_format" required defaultValue={screen?.screen_format ?? ""} className={inputCls}>
            <option value="">Choose…</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Seat count">
          <input name="seat_count" defaultValue={screen?.seat_count ?? ""} className={inputCls} />
        </Field>
        <Field label="Opening date">
          <input name="opening_date" defaultValue={screen?.opening_date ?? ""} className={inputCls} />
        </Field>
        {state && !state.ok && (
          <p className="col-span-2 text-sm text-error">{state.error}</p>
        )}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <SubtleButton type="button" onClick={onClose}>Cancel</SubtleButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

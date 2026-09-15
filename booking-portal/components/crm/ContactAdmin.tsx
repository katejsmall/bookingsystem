"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { deleteContact, saveContact } from "@/app/actions/crm";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, Modal, PrimaryButton, SubtleButton, inputCls } from "@/components/ui";
import { FORMATS, type Contact } from "@/lib/types";
import type { TitleOpt } from "@/components/crm/TitleSearchSelect";

type ExhibitorOpt = { exhibitor_unique: string; name: string };
type ScreenOpt = { screenUnique: string; exhibitorId: string | null; label: string };

export function ContactAdmin({
  contacts,
  exhibitors,
  screens,
  titles,
}: {
  contacts: Contact[];
  exhibitors: ExhibitorOpt[];
  screens: ScreenOpt[];
  titles: TitleOpt[];
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const exhibitorName = useMemo(
    () => new Map(exhibitors.map((e) => [e.exhibitor_unique, e.name])),
    [exhibitors]
  );
  const titleName = useMemo(() => new Map(titles.map((t) => [t.titleNo, t.name])), [titles]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        !q ||
        `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.country?.toLowerCase().includes(q) ||
        exhibitorName.get(c.exhibitor_unique ?? "")?.toLowerCase().includes(q)
    );
  }, [contacts, search, exhibitorName]);

  const remove = (c: Contact) => {
    if (!window.confirm(`Delete contact ${c.first_name ?? ""} ${c.last_name ?? ""}?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteContact(c.id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className={`${inputCls} max-w-xs`}
        />
        <PrimaryButton onClick={() => setEditing("add")}>Add contact</PrimaryButton>
        <p className="ml-auto text-xs text-muted">{rows.length} of {contacts.length}</p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email / phone</th>
              <th className="px-4 py-2.5 font-medium">Exhibitor</th>
              <th className="px-4 py-2.5 font-medium">Country</th>
              <th className="px-4 py-2.5 font-medium">Formats</th>
              <th className="px-4 py-2.5 font-medium">Links</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No contacts yet.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-muted">
                  <div>{c.email ?? "—"}</div>
                  {c.phone && <div className="text-xs">{c.phone}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {exhibitorName.get(c.exhibitor_unique ?? "") ?? c.exhibitor_unique ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted">{c.country ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {c.relevant_formats?.join(", ") || "—"}
                </td>
                <td
                  className="px-4 py-2.5 text-xs text-muted"
                  title={c.contact_titles.map((t) => titleName.get(t.title_no) ?? t.title_no).join("\n")}
                >
                  {c.contact_screens.length} screen{c.contact_screens.length === 1 ? "" : "s"} ·{" "}
                  {c.contact_titles.length} title{c.contact_titles.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    <SubtleButton onClick={() => setEditing(c)}>Edit</SubtleButton>
                    <SubtleButton onClick={() => remove(c)}>Delete</SubtleButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContactForm
          contact={editing === "add" ? null : editing}
          exhibitors={exhibitors}
          screens={screens}
          titles={titles}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ContactForm({
  contact,
  exhibitors,
  screens,
  titles,
  onClose,
}: {
  contact: Contact | null;
  exhibitors: ExhibitorOpt[];
  screens: ScreenOpt[];
  titles: TitleOpt[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveContact,
    null
  );
  const [exhibitor, setExhibitor] = useState(contact?.exhibitor_unique ?? "");
  const [linkedScreens, setLinkedScreens] = useState<string[]>(
    contact?.contact_screens.map((s) => s.screen_unique) ?? []
  );
  const [linkedTitles, setLinkedTitles] = useState<string[]>(
    contact?.contact_titles.map((t) => t.title_no) ?? []
  );
  const [pendingTitle, setPendingTitle] = useState(0); // resets the search box after add

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  // Screens of the linked exhibitor first; others still selectable below.
  const screenOpts = useMemo(() => {
    const own = screens.filter((s) => exhibitor && s.exhibitorId === exhibitor);
    return own.length ? own : screens;
  }, [screens, exhibitor]);

  const titleName = useMemo(() => new Map(titles.map((t) => [t.titleNo, t.name])), [titles]);

  return (
    <Modal
      title={contact ? "Edit contact" : "Add contact"}
      onClose={onClose}
      wide
    >
      <form action={formAction} className="grid grid-cols-2 gap-3">
        {contact && <input type="hidden" name="id" value={contact.id} />}
        <Field label="First name">
          <input name="first_name" defaultValue={contact?.first_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Last name">
          <input name="last_name" defaultValue={contact?.last_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" name="email" defaultValue={contact?.email ?? ""} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={contact?.phone ?? ""} className={inputCls} />
        </Field>
        <Field label="Country">
          <input name="country" defaultValue={contact?.country ?? ""} className={inputCls} />
        </Field>
        <Field label="Exhibitor">
          <select
            name="exhibitor_unique"
            value={exhibitor}
            onChange={(e) => setExhibitor(e.target.value)}
            className={inputCls}
          >
            <option value="">None</option>
            {exhibitors.map((e) => (
              <option key={e.exhibitor_unique} value={e.exhibitor_unique}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">Relevant formats</span>
          <div className="flex gap-4 text-sm">
            {FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="relevant_formats"
                  value={f}
                  defaultChecked={contact?.relevant_formats?.includes(f) ?? false}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">Linked screens</span>
          <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-line p-2">
            {screenOpts.map((s) => (
              <label key={s.screenUnique} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="screens"
                  value={s.screenUnique}
                  checked={linkedScreens.includes(s.screenUnique)}
                  onChange={(e) =>
                    setLinkedScreens((prev) =>
                      e.target.checked
                        ? [...prev, s.screenUnique]
                        : prev.filter((x) => x !== s.screenUnique)
                    )
                  }
                />
                {s.label}
              </label>
            ))}
            {screenOpts.length === 0 && (
              <p className="text-xs text-muted">No screens available.</p>
            )}
          </div>
        </div>

        <div className="col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">Linked titles</span>
          {linkedTitles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {linkedTitles.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full border border-line bg-foreground/5 px-2 py-0.5 text-xs"
                >
                  <input type="hidden" name="titles" value={t} />
                  {titleName.get(t) ?? t}
                  <button
                    type="button"
                    aria-label={`Remove ${titleName.get(t) ?? t}`}
                    onClick={() => setLinkedTitles((prev) => prev.filter((x) => x !== t))}
                    className="text-muted hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <TitleAdder
            key={pendingTitle}
            titles={titles}
            onAdd={(titleNo) => {
              setLinkedTitles((prev) => (prev.includes(titleNo) ? prev : [...prev, titleNo]));
              setPendingTitle((n) => n + 1);
            }}
          />
        </div>

        {state && !state.ok && <p className="col-span-2 text-sm text-error">{state.error}</p>}
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

/** Search-and-add for title links; reuses the lineup title picker UI. */
function TitleAdder({
  titles,
  onAdd,
}: {
  titles: TitleOpt[];
  onAdd: (titleNo: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return titles.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 10);
  }, [titles, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a title to link…"
        className={inputCls}
      />
      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {matches.map((t) => (
            <li key={t.titleNo}>
              <button
                type="button"
                onClick={() => {
                  onAdd(t.titleNo);
                  setQuery("");
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-foreground/5"
              >
                {t.name}
                <span className="ml-2 font-mono text-[10px] text-muted">{t.titleNo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

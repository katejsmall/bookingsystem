"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitProductionRequest } from "@/app/actions/productionRequests";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, PrimaryButton, inputCls } from "@/components/ui";
import { PRODUCTION_FORMATS } from "@/lib/types";

export function ProductionRequestForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitProductionRequest,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg border border-line bg-surface p-5 shadow-sm"
    >
      <Field label="Title">
        <input
          type="text"
          name="title_text"
          required
          placeholder="Title you'd like to see produced"
          className={inputCls}
        />
      </Field>

      <Field label="Format">
        <div className="flex flex-wrap gap-4">
          {PRODUCTION_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="format" value={f} required />
              {f}
            </label>
          ))}
        </div>
      </Field>

      <Field label="IMDb link (optional)">
        <input type="url" name="imdb_link" placeholder="https://www.imdb.com/title/…" className={inputCls} />
      </Field>

      <Field label="First release date (optional)">
        <input type="date" name="first_release_date" className={inputCls} />
      </Field>

      <Field label="Notes (optional)">
        <textarea name="notes" rows={2} className={inputCls} />
      </Field>

      {state && !state.ok && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-sm text-confirmed" role="status">
          Request submitted — the CJ team will review it.
        </p>
      )}

      <PrimaryButton type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit request"}
      </PrimaryButton>
    </form>
  );
}

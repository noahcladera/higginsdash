"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { createSeason } from "@/lib/ladder/admin-actions";
import { useActionFeedback } from "@/lib/feedback";

export function CreateSeasonForm() {
  const { run, pending, error } = useActionFeedback({
    success: "Season created",
    successDescription: "Activate it from the table above when ready.",
  });

  const submit = (formData: FormData) => {
    const payload = {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: String(formData.get("endsOn") ?? ""),
      joinDeadline: String(formData.get("joinDeadline") ?? ""),
      entryFeeCents: Number(formData.get("entryFeeCents") ?? 1500),
      challengeRange: Number(formData.get("challengeRange") ?? 3),
      notes: String(formData.get("notes") ?? ""),
    };
    run(() => createSeason(payload));
  };

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      <Field name="name" label="Name" placeholder="Winter 2026" required />
      <Field
        name="slug"
        label="Slug"
        placeholder="winter-2026"
        required
        hint="Lowercase letters, numbers and dashes."
      />
      <Field name="startsOn" label="Starts" type="date" required />
      <Field name="endsOn" label="Ends" type="date" required />
      <Field
        name="joinDeadline"
        label="Join deadline"
        type="date"
        hint="Optional — last day to join."
      />
      <Field
        name="entryFeeCents"
        label="Entry fee (cents)"
        type="number"
        defaultValue="1500"
        hint="Set 0 for free."
      />
      <Field
        name="challengeRange"
        label="Challenge range (±)"
        type="number"
        defaultValue="3"
      />
      <div className="sm:col-span-2">
        <label className="block text-xs text-[var(--muted-foreground)]">
          Notes
        </label>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm"
          placeholder="Visible to admins only for now."
        />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
        {error && (
          <span className="text-xs text-[var(--destructive)]">{error}</span>
        )}
        <Button type="submit" tone="triaz" disabled={pending} className="ml-auto">
          {pending ? "Creating…" : "Create season"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-foreground)]">
        {label}
      </label>
      <input
        name={name}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm"
        {...rest}
      />
      {hint && (
        <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
          {hint}
        </p>
      )}
    </div>
  );
}

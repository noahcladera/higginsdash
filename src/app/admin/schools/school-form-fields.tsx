"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/lib/feedback";
import type { SimpleActionResult } from "@/lib/feedback/types";

export function SchoolFormFields({
  action,
  submitLabel,
  school,
  returnTo,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult | void>;
  submitLabel: string;
  returnTo?: string;
  school?: {
    id: string;
    slug: string;
    name: string;
    coachArriveAtHubMinutes: number;
    notes: string | null;
  };
}) {
  const { run, pending, error } = useActionFeedback({
    success: "School saved",
    errorTitle: "Couldn't save school",
    returnTo,
  });

  function onSubmit(formData: FormData) {
    if (returnTo) {
      run(() => action(formData) as Promise<SimpleActionResult>);
      return;
    }
    void action(formData);
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {school && <input type="hidden" name="schoolId" value={school.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Shown in the pickup picker, e.g. “IFS”.">
          <Input name="name" defaultValue={school?.name ?? ""} required />
        </Field>
        <Field
          label="Slug"
          hint="Lowercase, hyphens only. Becomes the URL key."
        >
          <Input
            name="slug"
            defaultValue={school?.slug ?? ""}
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            required
          />
        </Field>
      </div>

      <Field
        label="Staff at hub (minutes before pickup)"
        hint="How early teaching staff must be at your main hub to start pickup and still arrive on time. Typical values depend on traffic and partner schools."
      >
        <Input
          name="coachArriveAtHubMinutes"
          type="number"
          min={0}
          max={240}
          defaultValue={school?.coachArriveAtHubMinutes ?? 30}
          required
        />
      </Field>

      <Field
        label="Notes"
        hint="Internal notes — not shown to students."
        optional
      >
        <Textarea
          name="notes"
          rows={3}
          defaultValue={school?.notes ?? ""}
        />
      </Field>

      <div className="flex justify-end gap-2">
        {error && (
          <p className="mr-auto text-sm text-[var(--destructive)]">{error}</p>
        )}
        <Button tone="triaz" type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {optional && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}

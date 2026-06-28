"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/ui/image-upload";
import { useActionFeedback } from "@/lib/feedback";
import type { SimpleActionResult } from "@/lib/feedback/types";

export type VenueFormValues = {
  id: string;
  slug: string;
  name: string;
  kind: "club" | "school" | "rented_court";
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  clubId: string | null;
  notes: string | null;
  coverImageUrl: string | null;
  coverImageFocusY: number;
};

/**
 * Client-side venue form fields. ImageUpload needs client state, so the
 * whole form lives here while the parent server component loads clubs
 * and wires the server action.
 */
export function VenueFormFields({
  action,
  submitLabel,
  venue,
  clubs,
  clubNoun,
  brandShortName,
  schoolNoun,
  courtNoun,
  returnTo,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult | void>;
  submitLabel: string;
  venue?: VenueFormValues;
  clubs: Array<{ id: string; name: string }>;
  clubNoun: string;
  brandShortName: string;
  schoolNoun: string;
  courtNoun: string;
  /** After save on edit forms — navigate here with a toast. */
  returnTo?: string;
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Venue saved",
    errorTitle: "Couldn't save venue",
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
      {venue && <input type="hidden" name="venueId" value={venue.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Public-facing name, e.g. “AICS”.">
          <Input name="name" defaultValue={venue?.name ?? ""} required />
        </Field>
        <Field
          label="Slug"
          hint="Lowercase, hyphens only. Becomes the URL key."
        >
          <Input
            name="slug"
            defaultValue={venue?.slug ?? ""}
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" hint="What sort of venue this is.">
          <select
            name="kind"
            defaultValue={venue?.kind ?? "club"}
            className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)]"
            required
          >
            <option value="club">
              {clubNoun} ({brandShortName}-owned)
            </option>
            <option value="school">{schoolNoun} (pickup / onsite)</option>
            <option value="rented_court">Rented {courtNoun.toLowerCase()}</option>
          </select>
        </Field>
        <Field
          label={`Linked ${clubNoun.toLowerCase()}`}
          hint={`Only applies when kind = ${clubNoun}.`}
          optional
        >
          <select
            name="clubId"
            defaultValue={venue?.clubId ?? ""}
            className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)]"
          >
            <option value="">—</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ImageUpload
        name="coverImageUrl"
        defaultUrl={venue?.coverImageUrl ?? ""}
        kind="cover"
        aspect="16/9"
        label="Cover photo"
        helpText="Shown on club tiles and location cards in the parent portal. Landscape photos work best — 1600×900 or larger."
        focusYName="coverImageFocusY"
        defaultFocusY={venue?.coverImageFocusY ?? 50}
      />

      <div className="space-y-4 rounded-[var(--radius-md)] bg-[var(--surface)] p-5">
        <h3 className="text-sm font-medium">Address</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" optional>
            <Input
              name="addressLine1"
              defaultValue={venue?.addressLine1 ?? ""}
            />
          </Field>
          <Field label="Address line 2" optional>
            <Input
              name="addressLine2"
              defaultValue={venue?.addressLine2 ?? ""}
            />
          </Field>
          <Field label="Postal code" optional>
            <Input name="postalCode" defaultValue={venue?.postalCode ?? ""} />
          </Field>
          <Field label="City" optional>
            <Input name="city" defaultValue={venue?.city ?? ""} />
          </Field>
          <Field label="Country" hint="ISO country code, e.g. NL.">
            <Input
              name="country"
              defaultValue={venue?.country ?? "NL"}
              maxLength={2}
              required
            />
          </Field>
        </div>
      </div>

      <Field
        label="Notes"
        hint="Internal notes — not shown to students."
        optional
      >
        <Textarea name="notes" rows={3} defaultValue={venue?.notes ?? ""} />
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

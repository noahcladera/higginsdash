import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

/**
 * Shared venue create/edit form. Submit wires to whichever server
 * action the parent passes in via `action`. The `venue` prop is
 * optional — when `undefined` the form renders in "create" mode.
 *
 * `venue_kind` drives visibility of the club link field; the form is
 * a server component (no JS) so both are rendered and the server
 * action ignores `clubId` when kind !== "club".
 */
export async function VenueForm({
  action,
  submitLabel,
  venue,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  venue?: {
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
  };
}) {
  const [clubs, brand, terms] = await Promise.all([
    prisma.club.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    getCurrentBrand(),
    getTerms(),
  ]);
  const clubNoun = terms.club.singular;

  return (
    <form action={action} className="space-y-6">
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
            <option value="club">{clubNoun} ({brand.shortName}-owned)</option>
            <option value="school">{terms.school.singular} (pickup / onsite)</option>
            <option value="rented_court">Rented {terms.court.singular.toLowerCase()}</option>
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
        <Textarea
          name="notes"
          rows={3}
          defaultValue={venue?.notes ?? ""}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button tone="triaz" type="submit">
          {submitLabel}
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

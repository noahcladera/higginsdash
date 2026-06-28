"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionFeedback } from "@/lib/feedback";
import type { SimpleActionResult } from "@/lib/feedback/types";

export type PersonFormValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  notes: string | null;
  isAdmin: boolean;
};

export function PersonForm({
  defaults,
  action,
  submitLabel,
  lockIsAdmin = false,
  returnTo,
}: {
  defaults: PersonFormValues;
  action: (formData: FormData) => Promise<SimpleActionResult | void>;
  submitLabel: string;
  lockIsAdmin?: boolean;
  returnTo?: string;
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Person saved",
    errorTitle: "Couldn't save person",
    returnTo,
  });

  function onSubmit(formData: FormData) {
    if (returnTo) {
      run(() => action(formData) as Promise<SimpleActionResult>);
      return;
    }
    run(async () => {
      await action(formData);
      return { ok: true as const };
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={defaults.firstName}
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={defaults.lastName}
            autoComplete="family-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <DateField
            id="dateOfBirth"
            name="dateOfBirth"
            defaultValue={defaults.dateOfBirth ?? ""}
            mode="dob"
            locale="en-NL"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone ?? ""}
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={defaults.gender ?? ""}
            className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          >
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-[var(--border)] p-4">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Emergency contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emergencyContactName">Name</Label>
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={defaults.emergencyContactName ?? ""}
              placeholder="e.g. Jan Jansen"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergencyContactPhone">Phone</Label>
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              defaultValue={defaults.emergencyContactPhone ?? ""}
              placeholder="+31 6 ..."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="emergencyContactRelationship">
              Relationship{" "}
              <span className="text-[var(--muted-foreground)]">
                (required when contact name or phone is set)
              </span>
            </Label>
            <Input
              id="emergencyContactRelationship"
              name="emergencyContactRelationship"
              defaultValue={defaults.emergencyContactRelationship ?? ""}
              placeholder="Mother, Spouse, Sibling, ..."
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-[var(--border)] p-4">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Address
        </legend>
        <div className="space-y-1.5">
          <Label htmlFor="addressLine1">Street + house number</Label>
          <Input
            id="addressLine1"
            name="addressLine1"
            defaultValue={defaults.addressLine1 ?? ""}
            autoComplete="address-line1"
            placeholder="e.g. Mercatorstraat 25"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addressLine2">Toevoeging</Label>
          <Input
            id="addressLine2"
            name="addressLine2"
            defaultValue={defaults.addressLine2 ?? ""}
            autoComplete="address-line2"
            placeholder="A, bus 2, 1-hg, …"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Letter or addition to the house number — leave blank if there isn&apos;t one.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={defaults.postalCode ?? ""}
              autoComplete="postal-code"
              placeholder="1056PX"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              defaultValue={defaults.city ?? ""}
              autoComplete="address-level2"
              placeholder="Amsterdam"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              name="country"
              maxLength={2}
              defaultValue={defaults.country ?? "NL"}
              autoComplete="country"
              placeholder="NL"
            />
          </div>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ""}
          placeholder="Anything the office should remember about this person."
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="isAdmin"
          name="isAdmin"
          defaultChecked={defaults.isAdmin}
          disabled={lockIsAdmin}
        />
        <Label htmlFor="isAdmin" className="cursor-pointer">
          Admin access
        </Label>
        {lockIsAdmin && (
          <span className="text-xs text-[var(--muted-foreground)]">
            (you cannot remove your own admin flag)
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {returnTo ? (
          <Button asChild type="button" variant="ghost" disabled={pending}>
            <Link href={returnTo}>Cancel</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

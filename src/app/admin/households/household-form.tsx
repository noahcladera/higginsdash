"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PersonPicker } from "@/components/admin/person-picker";
import { useActionFeedback } from "@/lib/feedback";

export type HouseholdFormValues = {
  displayName: string;
  primaryContactPersonId: string | null;
  primaryContactInitial: { id: string; name: string; email: string | null } | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  notes: string | null;
};

export function HouseholdForm({
  defaults,
  action,
  submitLabel,
  householdId,
  primaryContactRestrictedToMembers = false,
}: {
  defaults: HouseholdFormValues;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  householdId?: string;
  primaryContactRestrictedToMembers?: boolean;
}) {
  const router = useRouter();
  const { run, pending, error } = useActionFeedback({
    success: "Household saved",
    errorTitle: "Couldn't save household",
  });

  function onSubmit(formData: FormData) {
    run(async () => {
      await action(formData);
      return { ok: true };
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          defaultValue={defaults.displayName}
          placeholder="e.g. Family de Vries"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Primary contact</Label>
        <PersonPicker
          name="primaryContactPersonId"
          required
          initial={defaults.primaryContactInitial}
          excludeInHousehold={!primaryContactRestrictedToMembers}
          householdId={householdId}
          placeholder={
            primaryContactRestrictedToMembers
              ? "Pick from current members…"
              : "Pick a person not yet in any household…"
          }
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          A person can only belong to one household at a time. The primary
          contact is automatically added as the first adult member when the
          household is created.
        </p>
      </div>

      <fieldset className="space-y-4 rounded-md border border-[var(--border)] p-4">
        <legend className="px-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Address
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addressLine1">Street + number</Label>
            <Input
              id="addressLine1"
              name="addressLine1"
              defaultValue={defaults.addressLine1 ?? ""}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="addressLine2">Toevoeging</Label>
            <Input
              id="addressLine2"
              name="addressLine2"
              defaultValue={defaults.addressLine2 ?? ""}
              placeholder="A, bus 2, 1-hg, …"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={defaults.postalCode ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              defaultValue={defaults.city ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              name="country"
              maxLength={2}
              defaultValue={defaults.country}
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
        />
      </div>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

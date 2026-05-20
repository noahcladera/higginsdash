"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useActionFeedback } from "@/lib/feedback";
import type { UpdateProfileResult } from "@/lib/account/profile-actions";

export interface ProfileInitial {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirthIso: string;
  gender: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
}

export type ProfileFormTone = "triaz" | "joint";

export function ProfileForm({
  initial,
  action,
  submitTone = "triaz",
}: {
  initial: ProfileInitial;
  action: (formData: FormData) => Promise<UpdateProfileResult>;
  submitTone?: ProfileFormTone;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const { run, pending, error } = useActionFeedback({
    success: "Profile saved",
    errorTitle: "Couldn't save profile",
    onSuccess: () => {
      setSavedAt(Date.now());
      setDirty(false);
    },
  });

  function onSubmit(formData: FormData) {
    run(() => action(formData));
  }

  return (
    <form
      action={onSubmit}
      onChange={() => setDirty(true)}
      className="space-y-8 pb-24"
    >
      <FormGroup
        title="Identity"
        description="What we'll call you and how to verify your age."
      >
        <Field label="First name" name="firstName" required>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={initial.firstName}
            required
          />
        </Field>
        <Field label="Last name" name="lastName" required>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={initial.lastName}
            required
          />
        </Field>
        <Field label="Phone" name="phone" required>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial.phone}
            placeholder="+31 6 …"
            required
          />
        </Field>
        <Field label="Date of birth" name="dateOfBirth" required>
          <DateField
            id="dateOfBirth"
            name="dateOfBirth"
            defaultValue={initial.dateOfBirthIso}
            mode="dob"
            locale="en-NL"
            required
          />
        </Field>
        <Field label="Gender" name="gender">
          <select
            id="gender"
            name="gender"
            defaultValue={initial.gender}
            className="flex h-11 w-full rounded-[var(--radius-md)] border border-transparent bg-[var(--surface)] px-3.5 text-sm text-[var(--foreground)] transition-all hover:bg-[var(--surface-strong)] focus:bg-[var(--card)] focus-visible:border-[var(--triaz)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
      </FormGroup>

      <FormGroup
        title="Address"
        description="Used for invoices and the occasional postcard."
      >
        <Field label="Street" name="addressLine1" wide required>
          <Input
            id="addressLine1"
            name="addressLine1"
            defaultValue={initial.addressLine1}
            placeholder="Damstraat 12"
            required
          />
        </Field>
        <Field label="Apartment / extra" name="addressLine2" wide>
          <Input
            id="addressLine2"
            name="addressLine2"
            defaultValue={initial.addressLine2}
          />
        </Field>
        <Field label="Postal code" name="postalCode" required>
          <Input
            id="postalCode"
            name="postalCode"
            defaultValue={initial.postalCode}
            placeholder="1234 AB"
            required
          />
        </Field>
        <Field label="City" name="city" required>
          <Input
            id="city"
            name="city"
            defaultValue={initial.city}
            placeholder="Amsterdam"
            required
          />
        </Field>
        <Field label="Country" name="country" required>
          <Input
            id="country"
            name="country"
            maxLength={2}
            defaultValue={initial.country}
            placeholder="NL"
            required
          />
        </Field>
      </FormGroup>

      <FormGroup
        title="Emergency contact"
        description="Who should we call if something happens? All three fields are required so we can reach someone fast."
      >
        <Field label="Name" name="emergencyContactName" required>
          <Input
            id="emergencyContactName"
            name="emergencyContactName"
            defaultValue={initial.emergencyContactName}
            required
          />
        </Field>
        <Field label="Phone" name="emergencyContactPhone" required>
          <Input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            defaultValue={initial.emergencyContactPhone}
            required
          />
        </Field>
        <Field
          label="Relationship"
          name="emergencyContactRelationship"
          wide
          required
        >
          <Input
            id="emergencyContactRelationship"
            name="emergencyContactRelationship"
            placeholder="Partner / parent / friend …"
            defaultValue={initial.emergencyContactRelationship}
            required
          />
        </Field>
      </FormGroup>

      <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2">
        <div
          className={cn(
            "flex items-center gap-3 rounded-full bg-[var(--card)] px-2 py-2 shadow-[var(--shadow-lg)] transition-all",
            !dirty &&
              !pending &&
              !error &&
              !savedAt &&
              "opacity-0 pointer-events-none translate-y-2",
          )}
        >
          {error ? (
            <span className="px-3 text-sm text-[var(--destructive)]">
              {error}
            </span>
          ) : pending ? (
            <span className="px-3 text-sm text-[var(--muted-foreground)]">
              Saving…
            </span>
          ) : dirty ? (
            <span className="px-3 text-sm text-[var(--muted-foreground)]">
              Unsaved changes
            </span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1.5 px-3 text-sm text-[var(--triaz-ink)]">
              <CheckIcon size={16} /> Saved
            </span>
          ) : null}
          <Button
            type="submit"
            tone={submitTone}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FormGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <header className="space-y-1.5">
        <h2 className="font-display text-xl font-medium tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {description}
          </p>
        )}
      </header>
      <div className="grid gap-4 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:grid-cols-2 sm:p-6">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  children,
  required,
  wide,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label
        htmlFor={name}
        className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
      >
        {label}
        {required && <span className="ml-1 text-[var(--destructive)]">*</span>}
      </Label>
      {children}
    </div>
  );
}

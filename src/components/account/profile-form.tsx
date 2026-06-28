"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AddressFields,
  mergeAddressForSubmit,
  splitNlAddressLine1,
  type AddressFieldsValue,
} from "@/components/forms/address-fields";
import { CountrySelect } from "@/components/forms/country-select";
import { PhoneInput } from "@/components/forms/phone-input";
import { DateField } from "@/components/ui/date-field";
import {
  FormField,
  FormPanel,
  FormSection,
} from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { selectClassName } from "@/lib/ui/form-control";
import type { CountryCode } from "@/lib/countries";
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
  avatarUrl?: string;
}

export type ProfileFormTone = "triaz" | "joint";

function initialAddressFromProfile(initial: ProfileInitial): AddressFieldsValue {
  if (initial.country === "NL") {
    const { streetName, houseNumber } = splitNlAddressLine1(initial.addressLine1);
    return {
      streetName,
      houseNumber,
      houseNumberSuffix: initial.addressLine2,
      addressLine1: initial.addressLine1,
      addressLine2: initial.addressLine2,
      postalCode: initial.postalCode,
      city: initial.city,
    };
  }
  return {
    streetName: "",
    houseNumber: "",
    houseNumberSuffix: "",
    addressLine1: initial.addressLine1,
    addressLine2: initial.addressLine2,
    postalCode: initial.postalCode,
    city: initial.city,
  };
}

export function ProfileForm({
  initial,
  action,
  submitTone = "triaz",
  avatarUploadSlot,
}: {
  initial: ProfileInitial;
  action: (formData: FormData) => Promise<UpdateProfileResult>;
  submitTone?: ProfileFormTone;
  avatarUploadSlot?: ReactNode;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [phone, setPhone] = useState(initial.phone);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initial.emergencyContactPhone,
  );
  const [country, setCountry] = useState<CountryCode>(
    (initial.country as CountryCode) || "NL",
  );
  const [address, setAddress] = useState<AddressFieldsValue>(() =>
    initialAddressFromProfile(initial),
  );

  const { run, pending, error } = useActionFeedback({
    success: "Profile saved",
    errorTitle: "Couldn't save profile",
    onSuccess: () => {
      setSavedAt(Date.now());
      setDirty(false);
    },
  });

  const markDirty = () => setDirty(true);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const { addressLine1, addressLine2 } = mergeAddressForSubmit(
      country,
      address,
    );
    fd.set("phone", phone);
    fd.set("country", country);
    fd.set("addressLine1", addressLine1);
    fd.set("addressLine2", addressLine2 ?? "");
    fd.set("postalCode", address.postalCode);
    fd.set("city", address.city);
    fd.set("emergencyContactPhone", emergencyContactPhone);
    run(() => action(fd));
  }

  const countryForPhone = useMemo(() => country, [country]);

  return (
    <form
      onSubmit={handleSubmit}
      onChange={markDirty}
      className="space-y-8 pb-24"
    >
      {avatarUploadSlot && (
        <div className="grouped-section p-4 md:elev-card">
          {avatarUploadSlot}
        </div>
      )}
      <FormSection
        title="Identity"
        description="What we'll call you and how to verify your age."
      >
        <FormPanel variant="grouped">
          <FormField label="First name" name="firstName" required>
            <Input
              id="firstName"
              name="firstName"
              defaultValue={initial.firstName}
              required
            />
          </FormField>
          <FormField label="Last name" name="lastName" required>
            <Input
              id="lastName"
              name="lastName"
              defaultValue={initial.lastName}
              required
            />
          </FormField>
          <FormField label="Phone" name="phone" required>
            <PhoneInput
              id="phone"
              value={phone}
              onChange={(next) => {
                setPhone(next);
                markDirty();
              }}
              defaultCountryCode={countryForPhone}
              required
            />
          </FormField>
          <FormField label="Date of birth" name="dateOfBirth" required>
            <DateField
              id="dateOfBirth"
              name="dateOfBirth"
              defaultValue={initial.dateOfBirthIso}
              mode="dob"
              locale="en-NL"
              required
            />
          </FormField>
          <FormField label="Gender" name="gender">
            <select
              id="gender"
              name="gender"
              defaultValue={initial.gender}
              className={selectClassName()}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </FormField>
        </FormPanel>
      </FormSection>

      <FormSection
        title="Address"
        description="Used for invoices and emergency contact."
      >
        <FormPanel variant="grouped">
          <FormField label="Country" name="country" required>
            <CountrySelect
              id="country"
              value={country}
              onChange={(next) => {
                setCountry(next);
                markDirty();
              }}
              required
            />
          </FormField>
          <div className="sm:col-span-2">
            <AddressFields
              country={country}
              value={address}
              onChange={(next) => {
                setAddress(next);
                markDirty();
              }}
              idPrefix="profile"
            />
          </div>
        </FormPanel>
      </FormSection>

      <FormSection
        title="Emergency contact"
        description="Who should we call if something happens? All three fields are required so we can reach someone fast."
      >
        <FormPanel variant="grouped">
          <FormField label="Name" name="emergencyContactName" required>
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={initial.emergencyContactName}
              required
            />
          </FormField>
          <FormField label="Phone" name="emergencyContactPhone" required>
            <PhoneInput
              id="emergencyContactPhone"
              value={emergencyContactPhone}
              onChange={(next) => {
                setEmergencyContactPhone(next);
                markDirty();
              }}
              defaultCountryCode={countryForPhone}
              required
            />
          </FormField>
          <FormField
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
          </FormField>
        </FormPanel>
      </FormSection>

      <div className="fixed bottom-above-tab-bar left-1/2 z-20 -translate-x-1/2 lg:bottom-4">
        <div
          className={cn(
            "flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-2 shadow-[var(--shadow-lg)] transition-all",
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
            variant="glassProminent"
            tone={submitTone}
            loading={pending}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

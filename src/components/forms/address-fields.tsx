"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatNlPostcodeInput } from "@/lib/address/nl-postcode";

export interface AddressFieldsValue {
  streetName: string;
  houseNumber: string;
  houseNumberSuffix: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
}

export function emptyAddressValue(): AddressFieldsValue {
  return {
    streetName: "",
    houseNumber: "",
    houseNumberSuffix: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    city: "",
  };
}

/** Best-effort split of a combined NL address line for profile editing. */
export function splitNlAddressLine1(line: string): {
  streetName: string;
  houseNumber: string;
} {
  const trimmed = line.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
  if (match) {
    return { streetName: match[1]!.trim(), houseNumber: match[2]!.trim() };
  }
  return { streetName: trimmed, houseNumber: "" };
}

export function mergeAddressForSubmit(
  country: string,
  value: AddressFieldsValue,
): { addressLine1: string; addressLine2: string | null } {
  if (country === "NL") {
    const street = value.streetName.trim();
    const number = value.houseNumber.trim();
    const suffix = value.houseNumberSuffix.trim();
    return {
      addressLine1: [street, number].filter(Boolean).join(" "),
      addressLine2: suffix || null,
    };
  }
  return {
    addressLine1: value.addressLine1.trim(),
    addressLine2: value.addressLine2.trim() || null,
  };
}

function patchValue(
  value: AddressFieldsValue,
  patch: Partial<AddressFieldsValue>,
): AddressFieldsValue {
  return { ...value, ...patch };
}

export function AddressFields({
  country,
  value,
  onChange,
  idPrefix = "address",
}: {
  country: string;
  value: AddressFieldsValue;
  onChange: Dispatch<SetStateAction<AddressFieldsValue>>;
  idPrefix?: string;
}) {
  if (country === "NL") {
    return (
      <NlAddressFields
        value={value}
        onChange={onChange}
        idPrefix={idPrefix}
      />
    );
  }

  return (
    <InternationalAddressFields
      value={value}
      onChange={onChange}
      idPrefix={idPrefix}
    />
  );
}

function NlAddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AddressFieldsValue;
  onChange: Dispatch<SetStateAction<AddressFieldsValue>>;
  idPrefix: string;
}) {
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "not_found" | "error"
  >("idle");
  const lastLookupKey = useRef("");

  const runLookup = useCallback(async () => {
    const postcode = value.postalCode.trim();
    const number = value.houseNumber.trim();
    const suffix = value.houseNumberSuffix.trim();
    if (!postcode || !number) return;

    const key = `${postcode}|${number}|${suffix}`;
    if (key === lastLookupKey.current && lookupState === "found") return;

    setLookupState("loading");
    try {
      const params = new URLSearchParams({
        postcode,
        number,
      });
      if (suffix) params.set("suffix", suffix);
      const res = await fetch(`/api/address/nl-lookup?${params.toString()}`);
      if (res.status === 404) {
        setLookupState("not_found");
        lastLookupKey.current = key;
        return;
      }
      if (!res.ok) {
        setLookupState("error");
        return;
      }
      const data = (await res.json()) as {
        street: string;
        city: string;
        postalCode: string;
      };
      onChange((current) => ({
        ...current,
        streetName: data.street,
        city: data.city,
        postalCode: data.postalCode,
      }));
      setLookupState("found");
      lastLookupKey.current = key;
    } catch {
      setLookupState("error");
    }
  }, [
    value.postalCode,
    value.houseNumber,
    value.houseNumberSuffix,
    onChange,
    lookupState,
  ]);

  useEffect(() => {
    if (lookupState === "found" || lookupState === "not_found") {
      const key = `${value.postalCode.trim()}|${value.houseNumber.trim()}|${value.houseNumberSuffix.trim()}`;
      if (key !== lastLookupKey.current) {
        setLookupState("idle");
      }
    }
  }, [value.postalCode, value.houseNumber, value.houseNumberSuffix, lookupState]);

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <FormField
        label="Postal code"
        name={`${idPrefix}-postalCode`}
        required
        className="sm:col-span-3"
      >
        <Input
          id={`${idPrefix}-postalCode`}
          value={value.postalCode}
          onChange={(e) =>
            onChange(
              patchValue(value, {
                postalCode: formatNlPostcodeInput(e.target.value),
              }),
            )
          }
          onBlur={runLookup}
          required
          autoComplete="postal-code"
          placeholder="1234 AB"
        />
      </FormField>
      <FormField
        label="House number"
        name={`${idPrefix}-houseNumber`}
        required
        className="sm:col-span-3"
      >
        <Input
          id={`${idPrefix}-houseNumber`}
          value={value.houseNumber}
          onChange={(e) =>
            onChange(patchValue(value, { houseNumber: e.target.value }))
          }
          onBlur={runLookup}
          required
          inputMode="numeric"
          placeholder="12"
        />
      </FormField>
      <FormField
        label="Toevoeging"
        name={`${idPrefix}-houseNumberSuffix`}
        className="sm:col-span-6"
      >
        <Input
          id={`${idPrefix}-houseNumberSuffix`}
          value={value.houseNumberSuffix}
          onChange={(e) =>
            onChange(
              patchValue(value, { houseNumberSuffix: e.target.value }),
            )
          }
          onBlur={runLookup}
          autoComplete="address-line2"
          placeholder="A, bus 2, 1-hg…"
        />
      </FormField>
      <FormField
        label="Street name"
        name={`${idPrefix}-streetName`}
        required
        className="sm:col-span-6"
      >
        <Input
          id={`${idPrefix}-streetName`}
          value={value.streetName}
          onChange={(e) =>
            onChange(patchValue(value, { streetName: e.target.value }))
          }
          required
          autoComplete="address-line1"
          placeholder="Damstraat"
          disabled={lookupState === "loading"}
        />
      </FormField>
      <FormField
        label="City"
        name={`${idPrefix}-city`}
        required
        className="sm:col-span-6"
      >
        <Input
          id={`${idPrefix}-city`}
          value={value.city}
          onChange={(e) => onChange(patchValue(value, { city: e.target.value }))}
          required
          autoComplete="address-level2"
          placeholder="Amsterdam"
          disabled={lookupState === "loading"}
        />
      </FormField>
      {lookupState === "loading" && (
        <p className="sm:col-span-6 text-xs text-[var(--muted-foreground)]">
          Looking up your address…
        </p>
      )}
      {lookupState === "not_found" && (
        <p className="sm:col-span-6 text-xs text-[var(--destructive)]">
          We couldn&apos;t find that address — please double-check your postcode
          and house number.
        </p>
      )}
      {lookupState === "error" && (
        <p className="sm:col-span-6 text-xs text-[var(--muted-foreground)]">
          Address lookup is temporarily unavailable. You can still enter your
          street and city manually.
        </p>
      )}
      <p className="sm:col-span-6 text-xs text-[var(--muted-foreground)]">
        Toevoeging is optional — only fill it in if your address has a letter or
        addition (e.g. Damstraat 12 A or 12 bus 3).
      </p>
    </div>
  );
}

function InternationalAddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AddressFieldsValue;
  onChange: Dispatch<SetStateAction<AddressFieldsValue>>;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <FormField
        label="Street address"
        name="addressLine1"
        required
        className="sm:col-span-6"
      >
        <Input
          id={`${idPrefix}-addressLine1`}
          name="addressLine1"
          value={value.addressLine1}
          onChange={(e) =>
            onChange(patchValue(value, { addressLine1: e.target.value }))
          }
          required
          autoComplete="address-line1"
          placeholder="123 Main Street"
        />
      </FormField>
      <FormField
        label="Apartment / extra"
        name="addressLine2"
        className="sm:col-span-6"
      >
        <Input
          id={`${idPrefix}-addressLine2`}
          name="addressLine2"
          value={value.addressLine2}
          onChange={(e) =>
            onChange(patchValue(value, { addressLine2: e.target.value }))
          }
          autoComplete="address-line2"
        />
      </FormField>
      <FormField
        label="Postal code"
        name="postalCode"
        required
        className="sm:col-span-3"
      >
        <Input
          id={`${idPrefix}-postalCode`}
          name="postalCode"
          value={value.postalCode}
          onChange={(e) =>
            onChange(patchValue(value, { postalCode: e.target.value }))
          }
          required
          autoComplete="postal-code"
        />
      </FormField>
      <FormField
        label="City"
        name="city"
        required
        className="sm:col-span-3"
      >
        <Input
          id={`${idPrefix}-city`}
          name="city"
          value={value.city}
          onChange={(e) => onChange(patchValue(value, { city: e.target.value }))}
          required
          autoComplete="address-level2"
        />
      </FormField>
    </div>
  );
}

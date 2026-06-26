"use client";

import { useMemo } from "react";
import PhoneInputLib from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { Input } from "@/components/ui/input";
import { formControlClasses, formControlHeightClasses } from "@/lib/ui/form-control";
import { normalizePhoneE164, phoneDefaultCountry } from "@/lib/validation/phone";
import { cn } from "@/lib/utils";

function PhoneTextInput(props: React.ComponentProps<"input">) {
  return (
    <Input
      {...props}
      type="tel"
      autoComplete={props.autoComplete ?? "tel"}
    />
  );
}

export function PhoneInput({
  id,
  name,
  value,
  onChange,
  required,
  disabled,
  defaultCountryCode,
  className,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Stored country from address (NL, UK, …) — maps to phone default. */
  defaultCountryCode?: string | null;
  className?: string;
}) {
  const defaultCountry = phoneDefaultCountry(defaultCountryCode) as Country;
  // react-phone-number-input requires E.164; DB/seed data may store "+31 6 …".
  const e164Value = useMemo(() => {
    if (!value.trim()) return undefined;
    return normalizePhoneE164(value, defaultCountry) ?? undefined;
  }, [value, defaultCountry]);

  return (
    <div
      className={cn(
        "phone-input-root [&_.PhoneInputCountry]:mr-2 [&_.PhoneInputCountrySelect]:absolute [&_.PhoneInputCountrySelect]:inset-0 [&_.PhoneInputCountrySelect]:cursor-pointer [&_.PhoneInputCountrySelect]:opacity-0 [&_.PhoneInputCountryIcon]:overflow-hidden [&_.PhoneInputCountryIcon]:rounded-sm [&_.PhoneInputCountryIcon--border]:shadow-none",
        className,
      )}
    >
      <PhoneInputLib
        id={id}
        name={name}
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        value={e164Value}
        onChange={(next) => onChange(next ?? "")}
        inputComponent={PhoneTextInput}
        required={required}
        disabled={disabled}
        className={cn(
          "flex items-center",
          formControlClasses,
          formControlHeightClasses,
          "px-3.5",
        )}
      />
    </div>
  );
}

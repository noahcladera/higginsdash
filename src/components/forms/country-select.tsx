"use client";

import { selectClassName } from "@/lib/ui/form-control";
import { COUNTRY_OPTIONS, type CountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CountrySelect({
  id,
  name,
  value,
  onChange,
  required,
  className,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: CountryCode) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value as CountryCode)}
      required={required}
      autoComplete="country"
      className={cn(selectClassName(), className)}
    >
      {COUNTRY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

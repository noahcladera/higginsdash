import { z } from "zod";

import { isValidNlPostcode } from "@/lib/address/nl-postcode";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  isValidPhone,
  normalizePhoneE164,
  phoneDefaultCountry,
} from "@/lib/validation/phone";

export const countrySchema = z
  .string()
  .trim()
  .refine(
    (v) => COUNTRY_CODES.includes(v as (typeof COUNTRY_CODES)[number]),
    "Please select a country",
  )
  .default("NL");

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .superRefine((val, ctx) => {
    if (!isValidPhone(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid phone number",
      });
    }
  })
  .transform((val) => normalizePhoneE164(val)!);

export function phoneSchemaWithCountry(country?: string | null) {
  const defaultCountry = phoneDefaultCountry(country);
  return z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .superRefine((val, ctx) => {
      if (!isValidPhone(val, defaultCountry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid phone number",
        });
      }
    })
    .transform((val) => normalizePhoneE164(val, defaultCountry)!);
}

export function postalCodeSchema(country: string) {
  if (country === "NL") {
    return z
      .string()
      .trim()
      .min(1, "Postal code is required")
      .max(20)
      .refine(
        (v) => isValidNlPostcode(v),
        "Please enter a valid Dutch postcode (e.g. 1234 AB)",
      );
  }
  return z.string().trim().min(2, "Postal code is required").max(20);
}

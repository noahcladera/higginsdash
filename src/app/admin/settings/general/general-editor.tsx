"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateOrgGeneral } from "../actions";

const COUNTRY_OPTIONS = [
  { value: "NL", label: "Netherlands" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgium" },
  { value: "OTHER", label: "Other" },
];

const LOCALE_OPTIONS = [
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "German" },
  { value: "fr-FR", label: "French" },
];

const CURRENCY_OPTIONS = [
  { value: "EUR", label: "Euro (€)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "GBP", label: "British Pound (£)" },
];

/**
 * General-settings editor. Plain controlled inputs because the values
 * are short and we want immediate "Save" feedback rather than form-state
 * gymnastics.
 */
export function GeneralEditor({
  defaultDisplayName,
  defaultShortName,
  defaultCountry,
  defaultLocale,
  defaultCurrency,
  defaultOfficeEmail,
}: {
  defaultDisplayName: string;
  defaultShortName: string;
  defaultCountry: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultOfficeEmail: string;
}) {
  const [displayName, setDisplayName] = React.useState(defaultDisplayName);
  const [shortName, setShortName] = React.useState(defaultShortName);
  const [country, setCountry] = React.useState(defaultCountry);
  const [locale, setLocale] = React.useState(defaultLocale);
  const [currency, setCurrency] = React.useState(defaultCurrency);
  const [officeEmail, setOfficeEmail] = React.useState(defaultOfficeEmail);
  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const form = new FormData();
    form.set("displayName", displayName);
    form.set("shortName", shortName);
    form.set("country", country);
    form.set("locale", locale);
    form.set("currency", currency);
    form.set("officeEmail", officeEmail);
    try {
      const result = await updateOrgGeneral(form);
      if (result.ok) setStatus({ kind: "saved" });
      else setStatus({ kind: "error", message: result.error });
    } catch {
      setStatus({
        kind: "error",
        message: "Save failed. Check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              required
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              The full name your members see in the page title and on emails.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shortName">Short name</Label>
            <Input
              id="shortName"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={40}
              required
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Used in tight spaces — the sidebar header, breadcrumbs, the
              browser tab.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-transparent px-3 text-sm"
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted-foreground)]">
              Drives default phone format + tax behaviour.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locale">Locale</Label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-transparent px-3 text-sm"
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted-foreground)]">
              Controls how dates, times and numbers are formatted.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-transparent px-3 text-sm"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted-foreground)]">
              The currency every price tag is rendered in.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="officeEmail">Office email</Label>
          <Input
            id="officeEmail"
            type="email"
            value={officeEmail}
            onChange={(e) => setOfficeEmail(e.target.value)}
            maxLength={200}
            placeholder="office@example.com"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            The inbox members and admins reach when they tap a "talk to
            the office" link, plus the to-address on automated heads-ups
            (deletion requests, ladder admin pings, etc.). Leave blank
            to hide those mailtos.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Saving…" : "Save changes"}
        </Button>
        {status.kind === "saved" && (
          <span className="text-sm text-[var(--muted-foreground)]">
            Saved. Reload any open tab to see it everywhere.
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-sm text-[var(--destructive)]">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}

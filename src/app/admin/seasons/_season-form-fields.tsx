"use client";

import { Input } from "@/components/ui/input";
import type { SeasonAudience } from "@prisma/client";

export type SeasonFormValues = {
  name: string;
  audience: SeasonAudience;
  startsOn: string;
  endsOn: string;
  slug: string;
  notes: string;
};

export function SeasonAudiencePills({
  value,
  onChange,
  disabled,
}: {
  value: SeasonAudience;
  onChange: (v: SeasonAudience) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          { value: "youth" as const, label: "Youth" },
          { value: "adult" as const, label: "Adult" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? "rounded-full border border-[var(--triaz)] bg-[var(--triaz)]/10 px-4 py-2 text-sm font-medium text-[var(--foreground)]"
              : "rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:border-[var(--ring)]"
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {optional && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            optional
          </span>
        )}
        {required && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            required
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>
      )}
    </label>
  );
}

export const seasonSelectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

export function SeasonNameField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Name"
      required
      hint='How this season appears in the class dropdown — e.g. "Spring 2026".'
    >
      <Input
        name="name"
        required
        maxLength={80}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Spring 2026"
      />
    </Field>
  );
}

export function SeasonDateFields({
  audience,
  showDates,
  startsOn,
  endsOn,
  onStartsOnChange,
  onEndsOnChange,
  disabled,
}: {
  audience: SeasonAudience;
  /** Create hides dates for adult; edit always shows them as optional. */
  showDates: boolean;
  startsOn: string;
  endsOn: string;
  onStartsOnChange: (v: string) => void;
  onEndsOnChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (!showDates) return null;

  const required = audience === "youth";

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
      <Field
        label="Starts on"
        required={required}
        optional={!required}
        hint={
          audience === "adult"
            ? "Optional — fills the class date window when picked."
            : undefined
        }
      >
        <Input
          name="startsOn"
          type="date"
          required={required}
          value={startsOn}
          onChange={(e) => onStartsOnChange(e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Ends on"
        required={required}
        optional={!required}
      >
        <Input
          name="endsOn"
          type="date"
          required={required}
          value={endsOn}
          onChange={(e) => onEndsOnChange(e.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export function SeasonSlugField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Slug"
      optional
      hint="URL-safe id. Leave blank to derive from the name."
      className="sm:col-span-2"
    >
      <Input
        name="slug"
        maxLength={80}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="spring-2026"
        pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
      />
    </Field>
  );
}

export function SeasonNotesField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field
      label="Notes"
      optional
      hint="Internal — not shown to parents."
      className="sm:col-span-2"
    >
      <textarea
        name="notes"
        maxLength={2000}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)]"
      />
    </Field>
  );
}

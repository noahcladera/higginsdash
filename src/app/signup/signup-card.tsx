"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  AddressFields,
  emptyAddressValue,
  mergeAddressForSubmit,
  type AddressFieldsValue,
} from "@/components/forms/address-fields";
import { CountrySelect } from "@/components/forms/country-select";
import { PhoneInput } from "@/components/forms/phone-input";
import { DateField } from "@/components/ui/date-field";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectClassName } from "@/lib/ui/form-control";
import type { CountryCode } from "@/lib/countries";
import { KNOWN_SCHOOLS, isKnownSchool } from "@/lib/schools";
import { signUp } from "./actions";

const OTHER_SCHOOL = "__other__";

type Path = "myself" | "children";

interface ChildDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  school: string;
}

const EMPTY_CHILD: ChildDraft = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  school: "",
};

export function SignupCard({
  brandName,
  brandLogoUrl,
  officeEmail,
}: {
  brandName: string;
  brandLogoUrl?: string;
  officeEmail?: string;
}) {
  const [path, setPath] = useState<Path | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState<AddressFieldsValue>(emptyAddressValue());
  const [country, setCountry] = useState<CountryCode>("NL");

  const [parentAlsoPlays, setParentAlsoPlays] = useState(true);
  const [children, setChildren] = useState<ChildDraft[]>([{ ...EMPTY_CHILD }]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateChild(idx: number, patch: Partial<ChildDraft>) {
    setChildren((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  }
  function addChild() {
    setChildren((prev) => [...prev, { ...EMPTY_CHILD }]);
  }
  function removeChild(idx: number) {
    setChildren((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  const brandHeader = (
    <header className="space-y-3 text-center">
      {brandLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brandLogoUrl}
          alt={brandName}
          className="mx-auto h-12 w-auto object-contain"
        />
      )}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {path === null
            ? `Create your ${brandName} account`
            : path === "myself"
              ? "Tell us about you"
              : "Tell us about you and your kids"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {path === null
            ? "Who are you signing up?"
            : "A few details so we can manage lessons, invoices, and emergency contact."}
        </p>
      </div>
    </header>
  );

  if (path === null) {
    return (
      <div className="space-y-8">
        {brandHeader}

        <div className="grid gap-3 sm:grid-cols-2">
          <PathButton
            title="For myself"
            blurb="I'm an adult enrolling in classes."
            onClick={() => setPath("myself")}
          />
          <PathButton
            title="For my child(ren)"
            blurb="I'm a parent enrolling my child. I can sign up for classes too."
            onClick={() => setPath("children")}
          />
        </div>

        <p className="text-center text-xs text-[var(--muted-foreground)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline hover:text-[var(--foreground)]"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedChildren = children.map((c) => ({
      firstName: c.firstName.trim(),
      lastName: c.lastName.trim(),
      dateOfBirth: c.dateOfBirth.trim(),
      school: c.school.trim(),
    }));

    const { addressLine1, addressLine2 } = mergeAddressForSubmit(
      country,
      address,
    );

    startTransition(async () => {
      const res = await signUp({
        path: path!,
        parentAlsoPlays: path === "children" ? parentAlsoPlays : true,
        email,
        password,
        firstName,
        lastName,
        phone,
        dateOfBirth,
        gender,
        addressLine1,
        addressLine2: addressLine2 ?? "",
        postalCode: address.postalCode,
        city: address.city,
        country,
        children: path === "children" ? trimmedChildren : [],
      });
      if (!("ok" in res) || !res.ok) {
        setError(res.error);
      }
    });
  }

  const childIncomplete =
    path === "children" &&
    children.some((c) => !c.firstName.trim() || !c.dateOfBirth.trim());

  const footerNote = officeEmail ? (
    <>
      Your information is stored securely and used only to manage your
      family&apos;s account at {brandName}. Questions?{" "}
      <a
        href={`mailto:${officeEmail}`}
        className="underline hover:text-[var(--foreground)]"
      >
        Email us
      </a>
      .
    </>
  ) : (
    <>
      Your information is stored securely and used only to manage your
      family&apos;s account at {brandName}.
    </>
  );

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 glass-panel-strong rounded-[var(--radius-lg)] p-6 sm:p-8"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {brandLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandLogoUrl}
              alt={brandName}
              className="mb-2 h-10 w-auto object-contain"
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            {path === "myself"
              ? "Tell us about you"
              : "Tell us about you and your kids"}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            A few details so we can manage lessons, invoices, and emergency
            contact.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPath(null)}
          className="shrink-0 text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
        >
          Switch
        </button>
      </div>

      <Section title="Account">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password" required>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="pr-20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          At least 8 characters. We&apos;ll use email for receipts and the
          occasional important update.
        </p>
      </Section>

      <Section title="About you">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" required>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
            />
          </Field>
          <Field label="Phone" required className="sm:col-span-2">
            <PhoneInput
              value={phone}
              onChange={setPhone}
              defaultCountryCode={country}
              required
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              How coaches and the office reach you about lessons or schedule
              changes.
            </p>
          </Field>
          <Field label="Date of birth" required>
            <DateField
              id="dateOfBirth"
              value={dateOfBirth}
              onChange={setDateOfBirth}
              mode="dob"
              locale="en-NL"
              required
            />
          </Field>
          <Field label="Gender">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={selectClassName()}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Address"
        description={`For invoices and emergency contact. We never share your address outside ${brandName}.`}
      >
        <div className="space-y-3">
          <Field label="Country" required className="max-w-xs">
            <CountrySelect
              value={country}
              onChange={setCountry}
              required
            />
          </Field>
          <AddressFields
            country={country}
            value={address}
            onChange={setAddress}
            idPrefix="signup"
          />
        </div>
      </Section>

      {path === "children" && (
        <>
          <Section title="Your children">
            <p className="text-xs text-[var(--muted-foreground)]">
              You can add more later from your portal.
            </p>
            <div className="mt-3 space-y-3">
              {children.map((c, idx) => (
                <div
                  key={idx}
                  className="elev-card rounded-[var(--radius-md)] p-4"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-sm font-medium text-[var(--foreground)]/80">
                      Child {idx + 1}
                    </span>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChild(idx)}
                        className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="First name" required>
                      <Input
                        value={c.firstName}
                        onChange={(e) =>
                          updateChild(idx, { firstName: e.target.value })
                        }
                        required
                      />
                    </Field>
                    <Field label="Last name">
                      <Input
                        value={c.lastName}
                        onChange={(e) =>
                          updateChild(idx, { lastName: e.target.value })
                        }
                        placeholder={lastName || "Same as you"}
                      />
                    </Field>
                    <Field label="Date of birth" required>
                      <DateField
                        id={idx === 0 ? "child-dateOfBirth" : undefined}
                        value={c.dateOfBirth}
                        onChange={(iso) =>
                          updateChild(idx, { dateOfBirth: iso })
                        }
                        mode="dob"
                        locale="en-NL"
                        required
                      />
                    </Field>
                    <Field label="School" className="sm:col-span-3">
                      <ChildSchoolPicker
                        value={c.school}
                        onChange={(next) =>
                          updateChild(idx, { school: next })
                        }
                      />
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Lets us recommend after-school pickup classes if your
                        child is at one of our partner schools. Leave blank if
                        you&apos;d rather not say.
                      </p>
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChild}
              >
                + Add another child
              </Button>
            </div>
          </Section>

          <Section title="Will you be playing too?">
            <label className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
              <input
                type="checkbox"
                checked={parentAlsoPlays}
                onChange={(e) => setParentAlsoPlays(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">
                  Yes, I&apos;m planning to take classes too.
                </span>
                <br />
                <span className="text-xs text-[var(--muted-foreground)]">
                  We&apos;ll suggest a family membership later if it saves you
                  money.
                </span>
              </span>
            </label>
          </Section>
        </>
      )}

      {error && (
        <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">{footerNote}</p>
        <Button
          type="submit"
          size="lg"
          disabled={isPending || childIncomplete}
        >
          {isPending ? "Creating account…" : "Create my account"}
        </Button>
      </div>
    </form>
  );
}

function PathButton({
  title,
  blurb,
  onClick,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group elev-card flex h-full flex-col gap-2 p-5 text-left transition-all",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]",
      )}
    >
      <span className="text-lg font-semibold tracking-tight">{title}</span>
      <span className="text-sm text-[var(--muted-foreground)]">{blurb}</span>
      <span className="mt-auto text-sm font-medium text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
        Continue →
      </span>
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-medium tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  required,
  className,
  children,
}: {
  label: string;
  name?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <FormField
      label={label}
      name={name}
      required={required}
      className={className}
    >
      {children}
    </FormField>
  );
}

function ChildSchoolPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const knownInitial = isKnownSchool(value);
  const [mode, setMode] = useState<string>(
    knownInitial ? value : value ? OTHER_SCHOOL : "",
  );
  const [other, setOther] = useState<string>(knownInitial ? "" : value);

  function pickMode(next: string) {
    setMode(next);
    if (next === OTHER_SCHOOL) {
      onChange(other);
    } else {
      onChange(next);
    }
  }
  function setOtherValue(next: string) {
    setOther(next);
    if (mode === OTHER_SCHOOL) onChange(next);
  }

  return (
    <div className="space-y-2">
      <select
        value={mode}
        onChange={(e) => pickMode(e.target.value)}
        className={cn(
          "flex h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--control)] px-3 py-1 text-sm shadow-xs",
          "hover:border-[var(--border-strong)] focus-visible:border-[var(--triaz)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        <option value="">— select school —</option>
        {KNOWN_SCHOOLS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.hint ? `${s.label} — ${s.hint}` : s.label}
          </option>
        ))}
        <option value={OTHER_SCHOOL}>Other (specify)</option>
      </select>
      {mode === OTHER_SCHOOL && (
        <Input
          aria-label="School name"
          value={other}
          onChange={(e) => setOtherValue(e.target.value)}
          placeholder="School name"
        />
      )}
    </div>
  );
}

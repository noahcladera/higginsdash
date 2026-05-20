"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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

export function SignupCard({ brandName }: { brandName: string }) {
  const [path, setPath] = useState<Path | null>(null);

  // Parent fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [streetName, setStreetName] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [houseNumberSuffix, setHouseNumberSuffix] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("NL");

  // Children-only fields
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

  // Path picker — first screen.
  if (path === null) {
    return (
      <div className="space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Create your {brandName} account
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Who are you signing up?
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <PathButton
            title="For myself"
            blurb="I'm an adult signing up for classes."
            onClick={() => setPath("myself")}
          />
          <PathButton
            title="For my child(ren)"
            blurb="I'm a parent signing up my kid(s). I can play too if I want."
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

    const street = streetName.trim();
    const number = houseNumber.trim();
    const suffix = houseNumberSuffix.trim();
    const addressLine1 = [street, number].filter(Boolean).join(" ");
    const addressLine2 = suffix || "";

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
        addressLine2,
        postalCode,
        city,
        country,
        children: path === "children" ? trimmedChildren : [],
      });
      if (!("ok" in res) || !res.ok) {
        setError(res.error);
      }
      // Success path: server action redirects, this branch is unreachable.
    });
  }

  const childIncomplete =
    path === "children" &&
    children.some((c) => !c.firstName.trim() || !c.dateOfBirth.trim());

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {path === "myself"
            ? "Tell us about you"
            : "Tell us about you and your kids"}
        </h1>
        <button
          type="button"
          onClick={() => setPath(null)}
          className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
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
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
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
          <Field label="Phone">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+31 6 …"
              autoComplete="tel"
            />
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
              className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Address">
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Street name" required className="sm:col-span-6">
            <Input
              value={streetName}
              onChange={(e) => setStreetName(e.target.value)}
              required
              autoComplete="address-line1"
              placeholder="Damstraat"
            />
          </Field>
          <Field label="House number" required className="sm:col-span-3">
            <Input
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              required
              inputMode="numeric"
              placeholder="12"
            />
          </Field>
          <Field
            label="Toevoeging"
            className="sm:col-span-3"
          >
            <Input
              value={houseNumberSuffix}
              onChange={(e) => setHouseNumberSuffix(e.target.value)}
              autoComplete="address-line2"
              placeholder="A, bus 2, 1-hg…"
            />
          </Field>
          <Field label="Postal code" required className="sm:col-span-3">
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              required
              autoComplete="postal-code"
              placeholder="1234 AB"
            />
          </Field>
          <Field label="City" required className="sm:col-span-3">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              autoComplete="address-level2"
              placeholder="Amsterdam"
            />
          </Field>
          <Field label="Country" required className="sm:col-span-3">
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={2}
              required
              autoComplete="country"
            />
          </Field>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Toevoeging is optional — only fill it in if your address has a letter
          or addition (e.g. Damstraat 12 A or 12 bus 3).
        </p>
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
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
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
        <p className="text-xs text-[var(--muted-foreground)]">
          By continuing you agree we can email you about your account.
        </p>
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
        "group flex h-full flex-col gap-2 rounded-lg border-2 border-[var(--border)] bg-[var(--card)] p-5 text-left transition-colors",
        "hover:border-[var(--accent)] hover:bg-[var(--muted)]/40",
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
    </div>
  );
}

/**
 * Controlled school picker for the children-array signup state. Mirrors
 * the UX of the uncontrolled <SchoolSelect /> but emits a single string
 * upward via `onChange` instead of relying on FormData.
 */
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
        className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs"
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

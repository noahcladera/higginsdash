"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useTerms } from "@/components/tenant/terms-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPortalTrialRequest } from "./actions";

type Audience = "kids" | "adults";

interface ChildOption {
  personId: string;
  displayName: string;
  age: number | null;
}

export function PortalTrialForm({
  initialContactName,
  initialEmail,
  initialPhone,
  childrenOptions,
  initialAudience,
  initialPlayerPersonId,
  initialPreferredClub,
  classSeriesId,
  classSeriesName,
  classProgramName,
}: {
  initialContactName: string;
  initialEmail: string;
  initialPhone: string;
  childrenOptions: ChildOption[];
  initialAudience?: Audience;
  initialPlayerPersonId?: string | null;
  initialPreferredClub?: "triaz" | "randwijck" | "no_preference";
  classSeriesId: string | null;
  classSeriesName: string | null;
  classProgramName: string | null;
}) {
  const t = useTerms();
  const defaultChild =
    (initialPlayerPersonId
      ? childrenOptions.find((c) => c.personId === initialPlayerPersonId)
      : null) ?? childrenOptions[0] ?? null;
  const [audience, setAudience] = useState<Audience>(
    initialAudience ?? (childrenOptions.length > 0 ? "kids" : "adults"),
  );
  const [contactName, setContactName] = useState(initialContactName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [selectedChildId, setSelectedChildId] = useState(
    defaultChild?.personId ?? "manual",
  );
  const [playerName, setPlayerName] = useState(defaultChild?.displayName ?? "");
  const [playerAge, setPlayerAge] = useState(
    defaultChild?.age != null ? String(defaultChild.age) : "",
  );
  const [preferredClub, setPreferredClub] = useState<
    "triaz" | "randwijck" | "no_preference"
  >(initialPreferredClub ?? "no_preference");
  const [notes, setNotes] = useState(
    classSeriesName
      ? `Interested in: ${classSeriesName}${classProgramName ? ` (${classProgramName})` : ""}.`
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedChild = useMemo(
    () => childrenOptions.find((c) => c.personId === selectedChildId) ?? null,
    [childrenOptions, selectedChildId],
  );

  function onChangeChild(nextId: string) {
    setSelectedChildId(nextId);
    if (nextId === "manual") return;
    const child = childrenOptions.find((c) => c.personId === nextId);
    if (!child) return;
    setPlayerName(child.displayName);
    setPlayerAge(child.age != null ? String(child.age) : "");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitPortalTrialRequest({
        audience,
        contactName,
        playerName: audience === "kids" ? playerName : "",
        playerAge:
          audience === "kids"
            ? playerAge === ""
              ? ""
              : Number(playerAge)
            : "",
        email,
        phone,
        preferredClub,
        notes,
        classSeriesId,
        playerPersonId:
          audience === "kids" && selectedChildId !== "manual"
            ? selectedChildId
            : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="elev-card p-6 space-y-4">
        <h2 className="font-display text-2xl font-medium tracking-tight">
          Trial request sent
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Thanks. Our office will reach out soon to suggest the best{" "}
          {t.class.singular.toLowerCase()} for your trial.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/portal/programs">Browse {t.class.plural.toLowerCase()}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/portal">Back to overview</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="elev-card p-6 space-y-5"
    >
      {classSeriesName && (
        <div className="rounded-md border border-[var(--triaz)]/20 bg-[var(--triaz-soft)] px-3 py-2.5 text-xs text-[var(--foreground)]">
          <p className="font-medium">Trial request for this {t.class.singular.toLowerCase()}</p>
          <p className="text-[var(--muted-foreground)] mt-0.5">
            {classSeriesName}
            {classProgramName ? ` · ${classProgramName}` : ""}
          </p>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who is the trial for?</legend>
        <p className="text-xs text-[var(--muted-foreground)]">
          Pick yourself or a child so we can route this to the right team.
        </p>
        <div className="flex gap-2">
          <AudiencePill
            checked={audience === "adults"}
            onClick={() => setAudience("adults")}
            label="Me (adult)"
          />
          <AudiencePill
            checked={audience === "kids"}
            onClick={() => setAudience("kids")}
            label="A child"
          />
        </div>
      </fieldset>

      {audience === "kids" && childrenOptions.length > 0 && (
        <Field label="Child on this account" helpText="Choose a child to prefill their details.">
          <select
            value={selectedChildId}
            onChange={(e) => onChangeChild(e.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
          >
            {childrenOptions.map((child) => (
              <option key={child.personId} value={child.personId}>
                {child.displayName}
              </option>
            ))}
            <option value="manual">Someone else</option>
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={audience === "adults" ? "Your name" : "Parent or guardian name"}
          helpText="This is the main contact person for this request."
          required
        >
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            autoComplete="name"
          />
        </Field>
        <Field label="Email" helpText="We'll send follow-ups and scheduling details here." required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field
          label="Phone"
          helpText="Optional, but useful if you'd like us to call or WhatsApp."
        >
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </Field>
        <Field
          label={audience === "adults" ? "Preferred location" : "Preferred location"}
          helpText="We'll prioritize this location when possible."
        >
          <select
            value={preferredClub}
            onChange={(e) =>
              setPreferredClub(
                e.target.value as "triaz" | "randwijck" | "no_preference",
              )
            }
            className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
          >
            <option value="no_preference">No preference</option>
            <option value="triaz">Triaz</option>
            <option value="randwijck">Randwijck</option>
          </select>
        </Field>
        {audience === "kids" && (
          <>
            <Field
              label={`${t.student.singular} name`}
              helpText="Name of the child joining the trial."
              required
            >
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
              />
            </Field>
            <Field
              label={`${t.student.singular} age`}
              helpText="Used to match to the most suitable group."
              required
            >
              <Input
                type="number"
                min={3}
                max={99}
                value={playerAge}
                onChange={(e) => setPlayerAge(e.target.value)}
                required
              />
            </Field>
          </>
        )}
      </div>

      {selectedChild && audience === "kids" && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Prefilled from your {t.household.singular.toLowerCase()} profile:{" "}
          {selectedChild.displayName}
          {selectedChild.age != null ? ` (${selectedChild.age})` : ""}.
        </p>
      )}

      <Field
        label="Notes"
        helpText={`Share schedule constraints, current level, or any context that helps us place the right ${t.class.singular.toLowerCase()}.`}
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-[var(--danger)]/50 bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/portal/programs"
          className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
        >
          Back to browse
        </Link>
        <Button type="submit" loading={isPending}>
          {isPending ? "Sending..." : "Request trial"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  helpText,
  required,
  children,
}: {
  label: string;
  helpText: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
      </Label>
      <p className="text-xs text-[var(--muted-foreground)]">{helpText}</p>
      {children}
    </div>
  );
}

function AudiencePill({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        checked
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--foreground)]"
      }`}
    >
      {label}
    </button>
  );
}

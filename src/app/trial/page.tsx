"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitTrialInterest } from "./actions";

type Audience = "kids" | "adults";

export default function TrialInterestPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <Card />
      </div>
    </main>
  );
}

function Card() {
  const [audience, setAudience] = useState<Audience>("kids");
  const [contactName, setContactName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerAge, setPlayerAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredClub, setPreferredClub] = useState<
    "triaz" | "randwijck" | "no_preference"
  >("no_preference");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const isAdult = audience === "adults";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitTrialInterest({
        audience,
        contactName,
        playerName: isAdult ? "" : playerName,
        playerAge: playerAge === "" ? "" : Number(playerAge),
        email,
        phone,
        preferredClub,
        notes,
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
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Got it — talk soon.
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          We&apos;ll reach out within a couple of working days to set up a
          trial lesson.
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/portal">Back to home</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Try a lesson with us
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Leave a few details and we&apos;ll get in touch about a trial lesson.
          No account needed.
        </p>
      </header>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who is the lesson for?</legend>
        <div className="flex gap-2">
          <RadioPill
            checked={audience === "kids"}
            onClick={() => setAudience("kids")}
            label="A child"
          />
          <RadioPill
            checked={audience === "adults"}
            onClick={() => setAudience("adults")}
            label="Myself (adult)"
          />
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={isAdult ? "Your name" : "Parent name"} required>
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            autoComplete="name"
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Phone (optional)">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </Field>
        <Field label="Preferred club">
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
        {!isAdult && (
          <>
            <Field label="Child name" required>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
              />
            </Field>
            <Field label="Child age" required>
              <Input
                type="number"
                min={3}
                max={18}
                value={playerAge}
                onChange={(e) => setPlayerAge(e.target.value)}
                required
              />
            </Field>
          </>
        )}
      </div>

      <Field label="Anything we should know? (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Times that work, current level, who recommended us…"
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
          href="/portal"
          className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
        >
          ← Back
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Request a trial"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required && <span className="ml-1 text-[var(--danger)]">*</span>}
      </Label>
      {children}
    </div>
  );
}

function RadioPill({
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

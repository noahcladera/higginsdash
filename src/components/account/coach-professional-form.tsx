"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useActionFeedback } from "@/lib/feedback";
import type { CoachProfessionalResult } from "@/lib/account/coach-actions";

type CoachEmploymentTypeLabel = "employee" | "freelancer";

export type StaffCoachProfessionalInitial = {
  bio: string;
  photoUrl: string;
};

export type StaffCoachProfessionalReadOnly = {
  knltbQualification: string | null;
  employmentType: CoachEmploymentTypeLabel;
  defaultHourlyRate: string | null;
  clubLabels: string[];
};

export type ZzpCoachProfessionalInitial = {
  businessName: string;
  vatNumber: string;
};

export type ZzpCoachProfessionalReadOnly = {
  defaultCourtRentalRate: string | null;
  contractStartIso: string | null;
  contractEndIso: string | null;
  clubLabels: string[];
};

export function CoachProfessionalStaffForm({
  initial,
  readOnly,
  action,
}: {
  initial: StaffCoachProfessionalInitial;
  readOnly: StaffCoachProfessionalReadOnly;
  action: (formData: FormData) => Promise<CoachProfessionalResult>;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const { run, pending, error } = useActionFeedback({
    success: "Coach profile saved",
    errorTitle: "Couldn't save coach profile",
    onSuccess: () => {
      setSavedAt(Date.now());
      setDirty(false);
    },
  });

  function onSubmit(formData: FormData) {
    run(() => action(formData));
  }

  return (
    <div className="space-y-10 pb-24">
      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Admin-managed details
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Rates and qualifications are set by the office — contact them if
            something looks wrong.
          </p>
        </header>
        <div className="grid gap-4 elev-card p-5 sm:p-6">
          <ReadOnlyRow
            label="Employment"
            value={
              readOnly.employmentType === "employee"
                ? "Employee"
                : "Freelancer"
            }
          />
          <ReadOnlyRow
            label="KNLTB qualification"
            value={readOnly.knltbQualification ?? "—"}
          />
          <ReadOnlyRow
            label="Default hourly rate"
            value={readOnly.defaultHourlyRate ?? "—"}
          />
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Club access
            </span>
            <p className="text-sm">
              {readOnly.clubLabels.length > 0
                ? readOnly.clubLabels.join(", ")
                : "All clubs"}
            </p>
          </div>
        </div>
      </section>

      <form
        action={onSubmit}
        onChange={() => setDirty(true)}
        className="grid gap-6 lg:grid-cols-[1fr_2fr]"
      >
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Your presentation
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            A short bio and a profile photo shown to parents in class rosters
            and the coach directory.
          </p>
        </header>
        <div className="grid gap-4 elev-card p-5 sm:p-6">
          <div className="space-y-1.5 sm:col-span-2">
            <Label
              htmlFor="bio"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              Bio
            </Label>
            <Textarea
              id="bio"
              name="bio"
              rows={5}
              defaultValue={initial.bio}
              className="min-h-[120px] resize-y"
            />
          </div>
          <div className="sm:col-span-2">
            <ImageUpload
              name="photoUrl"
              defaultUrl={initial.photoUrl}
              kind="photo"
              aspect="square"
              label="Profile photo"
              helpText="Shown to parents in class rosters and on the coach directory. JPG, PNG, or WebP up to 8MB."
              onChange={() => setDirty(true)}
            />
          </div>
        </div>

        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 lg:col-span-2">
          <div
            className={cn(
              "flex items-center gap-3 rounded-full bg-[var(--card)] px-2 py-2 shadow-[var(--shadow-lg)] transition-all",
              !dirty &&
                !pending &&
                !error &&
                !savedAt &&
                "opacity-0 pointer-events-none translate-y-2",
            )}
          >
            {error ? (
              <span className="px-3 text-sm text-[var(--destructive)]">
                {error}
              </span>
            ) : pending ? (
              <span className="px-3 text-sm text-[var(--muted-foreground)]">
                Saving…
              </span>
            ) : dirty ? (
              <span className="px-3 text-sm text-[var(--muted-foreground)]">
                Unsaved changes
              </span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1.5 px-3 text-sm text-[var(--triaz-ink)]">
                <CheckIcon size={16} /> Saved
              </span>
            ) : null}
            <Button type="submit" tone="triaz" loading={pending} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function CoachProfessionalZzpForm({
  initial,
  readOnly,
  action,
}: {
  initial: ZzpCoachProfessionalInitial;
  readOnly: ZzpCoachProfessionalReadOnly;
  action: (formData: FormData) => Promise<CoachProfessionalResult>;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const { run, pending, error } = useActionFeedback({
    success: "Business details saved",
    errorTitle: "Couldn't save business details",
    onSuccess: () => {
      setSavedAt(Date.now());
      setDirty(false);
    },
  });

  function onSubmit(formData: FormData) {
    run(() => action(formData));
  }

  return (
    <div className="space-y-10 pb-24">
      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Contract & rates
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Managed by the office — contact them to update.
          </p>
        </header>
        <div className="grid gap-4 elev-card p-5 sm:p-6">
          <ReadOnlyRow
            label="Default court rental rate"
            value={readOnly.defaultCourtRentalRate ?? "—"}
          />
          <ReadOnlyRow
            label="Contract start"
            value={formatDate(readOnly.contractStartIso)}
          />
          <ReadOnlyRow
            label="Contract end"
            value={formatDate(readOnly.contractEndIso)}
          />
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Club access
            </span>
            <p className="text-sm">
              {readOnly.clubLabels.length > 0
                ? readOnly.clubLabels.join(", ")
                : "All clubs"}
            </p>
          </div>
        </div>
      </section>

      <form
        action={onSubmit}
        onChange={() => setDirty(true)}
        className="grid gap-6 lg:grid-cols-[1fr_2fr]"
      >
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Business details
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your invoicing identity as an independent coach.
          </p>
        </header>
        <div className="grid gap-4 elev-card p-5 sm:grid-cols-2 sm:p-6">
          <div className="space-y-1.5 sm:col-span-2">
            <Label
              htmlFor="businessName"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              Business name
            </Label>
            <Input
              id="businessName"
              name="businessName"
              defaultValue={initial.businessName}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label
              htmlFor="vatNumber"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              VAT number
            </Label>
            <Input
              id="vatNumber"
              name="vatNumber"
              defaultValue={initial.vatNumber}
            />
          </div>
        </div>

        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 lg:col-span-2">
          <div
            className={cn(
              "flex items-center gap-3 rounded-full bg-[var(--card)] px-2 py-2 shadow-[var(--shadow-lg)] transition-all",
              !dirty &&
                !pending &&
                !error &&
                !savedAt &&
                "opacity-0 pointer-events-none translate-y-2",
            )}
          >
            {error ? (
              <span className="px-3 text-sm text-[var(--destructive)]">
                {error}
              </span>
            ) : pending ? (
              <span className="px-3 text-sm text-[var(--muted-foreground)]">
                Saving…
              </span>
            ) : dirty ? (
              <span className="px-3 text-sm text-[var(--muted-foreground)]">
                Unsaved changes
              </span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1.5 px-3 text-sm text-[var(--triaz-ink)]">
                <CheckIcon size={16} /> Saved
              </span>
            ) : null}
            <Button type="submit" tone="triaz" loading={pending} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

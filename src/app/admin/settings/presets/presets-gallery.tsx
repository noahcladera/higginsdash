"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

import { applyPreset } from "../actions";

interface PresetCard {
  slug: string;
  label: string;
  description: string;
  productMode: string;
  /** Resolved preset: count of flags that would be on after apply. */
  enabledFeatureCount: number;
}

/**
 * Gallery of industry presets. Applying a preset **locks** the org profile:
 * feature toggles and terminology follow the code-defined bundle until
 * platform support clears the lock.
 */
export function PresetsGallery({
  presets,
  currentSlug,
  profileLocked,
}: {
  presets: ReadonlyArray<PresetCard>;
  currentSlug: string;
  profileLocked: boolean;
}) {
  const [pending, setPending] = React.useState<PresetCard | null>(null);
  const [ackIrreversible, setAckIrreversible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onConfirm() {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.set("presetSlug", pending.slug);
    if (ackIrreversible) form.set("acknowledgeIrreversible", "on");
    try {
      const result = await applyPreset(form);
      if (result.ok) {
        window.location.href = "/admin/settings";
      } else {
        setError(result.error);
        setSubmitting(false);
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Apply failed. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      {profileLocked && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
          Your <strong>industry preset is locked</strong>. Feature toggles and
          vocabulary are fixed for your business model. To change preset or
          unlock editing, contact{" "}
          <strong className="text-[var(--foreground)]">platform support</strong>
          .
        </div>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {presets.map((preset) => {
          const isCurrent = preset.slug === currentSlug;
          return (
            <li
              key={preset.slug}
              className={
                "flex flex-col gap-3 rounded-2xl border p-5 " +
                (isCurrent
                  ? "border-[var(--triaz)] bg-[var(--triaz-soft)]/40"
                  : "border-[var(--border)] bg-[var(--card)]")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    {preset.productMode}
                  </div>
                  <h2 className="font-display text-2xl leading-tight">
                    {preset.label}
                  </h2>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-[var(--triaz)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Current
                  </span>
                )}
              </div>
              <p className="flex-1 text-sm text-[var(--muted-foreground)]">
                {preset.description}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                <span>
                  Includes{" "}
                  <strong>{preset.enabledFeatureCount}</strong> enabled
                  capabilities
                </span>
                <Button
                  variant={isCurrent ? "outline" : "solid"}
                  size="sm"
                  type="button"
                  disabled={profileLocked}
                  title={
                    profileLocked
                      ? "Profile is locked — contact support to change industry model."
                      : undefined
                  }
                  onClick={() => {
                    if (profileLocked) return;
                    setPending(preset);
                    setAckIrreversible(false);
                    setError(null);
                  }}
                >
                  {profileLocked
                    ? "Locked"
                    : isCurrent
                      ? "Re-apply & lock"
                      : "Use this preset"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setError(null);
            setAckIrreversible(false);
          }
        }}
      >
        <DialogContent>
          {pending && (
            <>
              <DialogTitle>Commit to &ldquo;{pending.label}&rdquo;?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-sm text-[var(--muted-foreground)]">
                  <p>
                    This choice sets your <strong>industry model</strong> for
                    this organization. We will reset feature toggles and
                    terminology to match this preset, then{" "}
                    <strong>lock the profile</strong>.
                  </p>
                  <p>
                    Your team will not be able to switch presets, edit the full
                    feature matrix, or rename glossary terms from the admin UI
                    after this — only platform support can unlock it if you
                    truly made a mistake.
                  </p>
                </div>
              </DialogDescription>

              <label className="mt-4 flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                <Checkbox
                  checked={ackIrreversible}
                  onChange={(e) => setAckIrreversible(e.currentTarget.checked)}
                />
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    I understand this is permanent for our organization
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Required — we take business identity seriously so operators
                    do not flip industry models casually.
                  </p>
                </div>
              </label>

              {error && (
                <p className="mt-3 text-sm text-[var(--destructive)]">{error}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPending(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onConfirm}
                  disabled={submitting || !ackIrreversible}
                >
                  {submitting ? "Locking profile…" : `Commit to ${pending.label}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

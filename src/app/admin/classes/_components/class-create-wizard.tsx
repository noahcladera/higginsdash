"use client";

import { Button } from "@/components/ui/button";

/**
 * Wizard chrome for the class/event/camp create form. Renders progress,
 * the current step's title/hint, the step body (provided by the parent
 * as `children`), and the Back / Next / Submit footer.
 *
 * The parent owns step state and validation; this component is pure
 * chrome so the same form can render every step inside one persistent
 * `<form>` (state in the field components survives Back/Next).
 */
export function ClassCreateWizard({
  stepIndex,
  totalSteps,
  stepTitle,
  stepHint,
  onBack,
  onNext,
  isLast,
  submitLabel,
  children,
}: {
  stepIndex: number;
  totalSteps: number;
  stepTitle: string;
  stepHint?: string;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <span>
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div
            className="h-full rounded-full bg-[var(--triaz-ink)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="pt-2">
          <h2 className="text-lg font-semibold">{stepTitle}</h2>
          {stepHint && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {stepHint}
            </p>
          )}
        </div>
      </div>

      <section className="space-y-4 rounded-[var(--radius-md)] bg-[var(--surface)] p-5">
        {children}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={stepIndex === 0}
        >
          Back
        </Button>
        {isLast ? (
          <Button tone="triaz" type="submit">
            {submitLabel}
          </Button>
        ) : (
          <Button tone="triaz" type="button" onClick={onNext}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

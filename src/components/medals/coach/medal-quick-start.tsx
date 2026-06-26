import Link from "next/link";
import { QUICK_START_STEPS } from "@/lib/medals/curriculum";

export function MedalQuickStart() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {QUICK_START_STEPS.map((step) => (
        <div
          key={step.step}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
            Step {step.step}
          </div>
          <h3 className="mt-1 font-display text-base font-medium">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {step.body}
          </p>
          {step.href && (
            <Link
              href={step.href}
              className="mt-3 inline-block text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
            >
              Open →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

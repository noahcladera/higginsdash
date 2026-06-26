import type { MedalLevelContent } from "@prisma/client";
import { medalShortCode } from "@/lib/medal-levels";

export function MedalLevelCard({ row }: { row: MedalLevelContent }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <div className="flex items-baseline gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-[var(--triaz-soft)] px-2 text-xs font-bold tracking-wide text-[var(--triaz-ink)]">
          {medalShortCode(row.medalLevel)}
        </span>
        <h2 className="font-display text-xl font-medium tracking-tight">
          {row.title}
        </h2>
      </div>
      {row.shortDescription && (
        <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">
          {row.shortDescription}
        </p>
      )}
      {row.longDescription.trim() ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
          {row.longDescription}
        </div>
      ) : (
        <p className="mt-4 text-sm italic text-[var(--muted-foreground)]">
          Description coming soon — ask your coach if you are unsure which medal
          fits.
        </p>
      )}
      {row.howToGraduate?.trim() ? (
        <div className="mt-4 rounded-lg bg-[var(--muted)]/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            To graduate
          </p>
          <p className="mt-1 text-sm leading-relaxed">{row.howToGraduate}</p>
        </div>
      ) : null}
    </article>
  );
}

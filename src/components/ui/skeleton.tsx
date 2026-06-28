/*
 * Skeleton kit — content-shaped placeholders shared by per-route
 * `loading.tsx` files so every navigation acknowledges in one frame with a
 * layout that resembles the destination (instead of a bare spinner or a
 * dashboard-shaped fallback that doesn't match the page).
 *
 * `RoutePageSkeleton` (generic list) and `BookingPageSkeleton` live in their
 * own files and stay as-is; this adds a base `Skeleton` block plus
 * detail-page and form-page shapes.
 */
import { cn } from "@/lib/utils";

/** A single pulsing placeholder block. Compose into page-shaped skeletons. */
export function Skeleton({
  className,
  tone = "base",
}: {
  className?: string;
  /** `base` = surface, `strong` = higher-contrast (titles, pills). */
  tone?: "base" | "strong";
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded",
        tone === "strong"
          ? "bg-[var(--surface-strong)]"
          : "bg-[var(--surface)]",
        className,
      )}
    />
  );
}

/** Header block: eyebrow pill + title + subtitle. Shared across shapes. */
function SkeletonHeader({ titleWidth = "w-56" }: { titleWidth?: string }) {
  return (
    <div className="space-y-3">
      <Skeleton tone="strong" className="h-3 w-16 rounded-full" />
      <Skeleton tone="strong" className={cn("h-9 max-w-[70%] rounded", titleWidth)} />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

/**
 * Detail-page skeleton — a back-link line, header, a tall primary panel
 * (summary / hero) and a shorter secondary panel. Matches the
 * program/series, coach class/session/student, and receipt detail layouts.
 */
export function DetailPageSkeleton({
  className,
  withBackLink = true,
  secondaryRows = 4,
}: {
  className?: string;
  withBackLink?: boolean;
  secondaryRows?: number;
}) {
  return (
    <div
      className={cn("space-y-8 fade-in", className)}
      aria-busy="true"
      aria-live="polite"
    >
      {withBackLink && <Skeleton className="h-3 w-28" />}
      <SkeletonHeader />
      <div className="h-40 animate-pulse elev-panel" />
      <div className="space-y-3">
        {Array.from({ length: secondaryRows }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse elev-panel" />
        ))}
      </div>
    </div>
  );
}

/**
 * Enroll-page skeleton — the series detail layout: summary header, a panel
 * of meta, then the sticky enroll CTA block at the bottom. This is the
 * heaviest portal page, so its loader is shaped to it specifically.
 */
export function EnrollPageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-8 fade-in", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton className="h-3 w-32" />
      <SkeletonHeader titleWidth="w-72" />
      {/* Session / schedule meta */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse elev-panel" />
        <div className="h-24 animate-pulse elev-panel" />
      </div>
      {/* Enroll panel: candidate picker rows + price + CTA */}
      <div className="space-y-4 elev-card p-5">
        <Skeleton tone="strong" className="h-4 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-[var(--radius-md)]" />
          <Skeleton className="h-12 w-full rounded-[var(--radius-md)]" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton tone="strong" className="h-6 w-20" />
        </div>
        <Skeleton tone="strong" className="h-11 w-full rounded-full" />
      </div>
    </div>
  );
}

/**
 * Form-page skeleton — header then stacked labelled field rows and a submit
 * button. Matches profile / security / professional / availability pages.
 */
export function FormPageSkeleton({
  className,
  fields = 4,
}: {
  className?: string;
  fields?: number;
}) {
  return (
    <div
      className={cn("space-y-8 fade-in", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <SkeletonHeader />
      <div className="space-y-5 elev-card p-5 sm:p-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-[var(--radius-md)]" />
          </div>
        ))}
        <Skeleton tone="strong" className="h-10 w-32 rounded-full" />
      </div>
    </div>
  );
}

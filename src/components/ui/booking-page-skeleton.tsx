/**
 * Booking calendar skeleton — mirrors the book page layout (club picker,
 * day scrubber, then a grouped list of time-slot rows) so the mobile tab
 * switch into Book feels like the page is already there.
 */
export function BookingPageSkeleton() {
  return (
    <div className="space-y-8 fade-in" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="h-9 w-56 max-w-[70%] animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>

      {/* Club picker pill track */}
      <div className="h-12 w-full animate-pulse rounded-full bg-[var(--surface-strong)]" />

      {/* Day scrubber */}
      <div className="flex items-center gap-2">
        <div className="size-10 animate-pulse rounded-full bg-[var(--surface)]" />
        <div className="h-9 flex-1 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="size-10 animate-pulse rounded-full bg-[var(--surface)]" />
      </div>

      {/* Slot rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}

/**
 * Generic skeleton used by per-route `loading.tsx` files so that every
 * sidebar click acknowledges in one frame instead of leaving the old
 * page on screen for multiple seconds while the server renders the
 * next RSC.
 *
 * Visual language matches `src/app/portal/loading.tsx` — same surface
 * tokens, same rounded radii, same `animate-pulse` placeholders — so
 * skeletons feel like a uniform "loading" state rather than ad-hoc
 * mocks per route.
 *
 * Default shape is a header (eyebrow + title + subtitle) over five row
 * cards, which fits list-style admin/portal pages well. `rows` lets a
 * caller bump it up/down for unusually short or tall pages.
 */
export interface RoutePageSkeletonProps {
  /** Number of row placeholders rendered under the header. Defaults to 5. */
  rows?: number;
  /** Extra classes appended to the root container. */
  className?: string;
}

export function RoutePageSkeleton({
  rows = 5,
  className,
}: RoutePageSkeletonProps) {
  return (
    <div
      className={`space-y-8 fade-in${className ? ` ${className}` : ""}`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="h-9 w-64 animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse elev-panel"
          />
        ))}
      </div>
    </div>
  );
}

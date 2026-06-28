/**
 * Generic content-shaped skeleton used by per-route `loading.tsx` files so
 * that every navigation acknowledges in one frame with a layout that
 * resembles the destination — instead of a bare spinner that makes the app
 * feel like a website reloading.
 *
 * The same shape renders on mobile and desktop (responsive), so a tab
 * switch on the phone shows a header (eyebrow + title + subtitle) over a
 * stack of row cards that fade into the real content.
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
        <div className="h-9 w-56 max-w-[70%] animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse elev-panel" />
        ))}
      </div>
    </div>
  );
}

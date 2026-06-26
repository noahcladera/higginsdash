export default function ClassesLoading() {
  return (
    <div className="space-y-10 fade-in" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="h-10 w-56 animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>
      <div className="h-14 animate-pulse elev-panel" />
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-strong)]/70" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse elev-panel" />
          <div className="h-28 animate-pulse elev-panel" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-strong)]/70" />
        <div className="h-48 animate-pulse elev-panel" />
      </div>
    </div>
  );
}

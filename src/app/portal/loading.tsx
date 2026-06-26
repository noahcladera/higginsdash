export default function PortalLoading() {
  return (
    <div className="space-y-10 fade-in">
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="h-10 w-64 animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>
      <div className="h-28 animate-pulse elev-panel" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse elev-panel"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse elev-panel" />
        <div className="h-72 animate-pulse elev-panel" />
      </div>
    </div>
  );
}

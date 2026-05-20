export default function FamilyLoading() {
  return (
    <div className="space-y-10 fade-in">
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-strong)]" />
        <div className="h-10 w-56 animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-5 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 sm:p-6 shadow-[var(--shadow-sm)]"
        >
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 animate-pulse rounded-full bg-[var(--surface-strong)]" />
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-[var(--surface-strong)]" />
              <div className="h-3 w-64 animate-pulse rounded bg-[var(--surface-strong)]/70" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--card)]" />
            <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--card)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

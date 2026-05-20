/**
 * Instant shell while the presets page RSC loads (avoids a blank tab when
 * compilation or DB is slow on first visit).
 */
export default function PresetsLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-48 animate-pulse rounded bg-[var(--surface)]" />
      <ul className="grid gap-4 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="flex h-48 animate-pulse flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
          />
        ))}
      </ul>
    </div>
  );
}

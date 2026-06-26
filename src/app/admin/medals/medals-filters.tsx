"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function MedalsFilters({
  seasons,
  clubs,
  coaches,
  selected,
}: {
  seasons: Array<{ id: string; name: string }>;
  clubs: Array<{ id: string; name: string }>;
  coaches: Array<{ id: string; name: string }>;
  selected: { seasonId: string; clubId: string; coachId: string };
}) {
  const router = useRouter();
  const hasFilters = !!(selected.seasonId || selected.clubId || selected.coachId);

  function apply(field: string, value: string) {
    const params = new URLSearchParams();
    const next = { ...selected, [field]: value };
    if (next.seasonId) params.set("seasonId", next.seasonId);
    if (next.clubId) params.set("clubId", next.clubId);
    if (next.coachId) params.set("coachId", next.coachId);
    const q = params.toString();
    router.push(q ? `/admin/medals?${q}` : "/admin/medals");
  }

  return (
    <div className="glass-ribbon flex flex-col gap-2.5 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
      <FilterSelect
        label="Season"
        value={selected.seasonId}
        onChange={(v) => apply("seasonId", v)}
        options={[
          { value: "", label: "All seasons" },
          ...seasons.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      <FilterSelect
        label="Club"
        value={selected.clubId}
        onChange={(v) => apply("clubId", v)}
        options={[
          { value: "", label: "All clubs" },
          ...clubs.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <FilterSelect
        label="Coach"
        value={selected.coachId}
        onChange={(v) => apply("coachId", v)}
        options={[
          { value: "", label: "All coaches" },
          ...coaches.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {hasFilters && (
        <Link
          href="/admin/medals"
          className="pb-1.5 text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline sm:ml-auto"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[12rem]">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "control-well h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-2.5 text-xs",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

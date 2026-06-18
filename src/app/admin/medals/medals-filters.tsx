"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";

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
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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
    <div className="space-y-1">
      <Label className="text-xs text-[var(--muted-foreground)]">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[10rem] rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
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

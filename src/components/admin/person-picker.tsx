"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Result = { id: string; name: string; email: string | null };

export type PersonPickerProps = {
  /** Hidden input name; the form will receive the selected person id under this name. */
  name: string;
  /** Initial selection (e.g. on edit pages). */
  initial?: { id: string; name: string; email: string | null } | null;
  /** Button label when no person is selected. */
  placeholder?: string;
  /** If true, hides anyone already in another household (used when assigning a brand-new household). */
  excludeInHousehold?: boolean;
  /** When excludeInHousehold is true, also include people in THIS household (used on edit). */
  householdId?: string;
  required?: boolean;
};

export function PersonPicker({
  name,
  initial = null,
  placeholder = "Pick a person…",
  excludeInHousehold = false,
  householdId,
  required = false,
}: PersonPickerProps) {
  const [selected, setSelected] = useState<Result | null>(initial);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1">
      <input
        type="hidden"
        name={name}
        value={selected?.id ?? ""}
        required={required}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span className={selected ? "" : "text-[var(--muted-foreground)]"}>
              {selected ? formatLabel(selected) : placeholder}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {selected ? "Change" : "Search"}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a person</DialogTitle>
          </DialogHeader>
          <Picker
            excludeInHousehold={excludeInHousehold}
            householdId={householdId}
            onPick={(r) => {
              setSelected(r);
              setOpen(false);
            }}
          />
          {selected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(null)}
            >
              Clear selection
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Picker({
  excludeInHousehold,
  householdId,
  onPick,
}: {
  excludeInHousehold: boolean;
  householdId?: string;
  onPick: (r: Result) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (excludeInHousehold) params.set("exclude_in_household", "1");
        if (householdId) params.set("household_id", householdId);

        const res = await fetch(`/api/admin/people-search?${params}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        if (alive) setResults(data.results);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, excludeInHousehold, householdId]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)]">
        {loading ? (
          <div className="p-4 text-sm text-[var(--muted-foreground)]">
            Searching…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-[var(--destructive)]">{error}</div>
        ) : results.length === 0 ? (
          <div className="p-4 text-sm text-[var(--muted-foreground)]">
            {q ? `No people match "${q}".` : "Start typing to search."}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-[var(--muted)]"
                  onClick={() => onPick(r)}
                >
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.email && (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {r.email}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatLabel(r: { name: string; email: string | null }) {
  return r.email ? `${r.name} · ${r.email}` : r.name;
}

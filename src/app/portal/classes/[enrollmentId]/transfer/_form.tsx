"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/lib/feedback";
import { requestClassTransfer } from "@/lib/portal/transfer-actions";

interface CandidateOption {
  id: string;
  label: string;
  startsOnIso: string;
  pricePerSeries: number | null;
  isFull: boolean;
}

/**
 * Two-column-ish form: a search box that filters the candidate list
 * client-side, plus a note. Free-text search keeps the picker calm
 * even with a long catalog and avoids forcing parents to scroll
 * through an unwieldy `<select>`.
 */
export function TransferRequestForm({
  enrollmentId,
  studentName,
  candidates,
}: {
  enrollmentId: string;
  studentName: string;
  candidates: CandidateOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 30);
    return candidates
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 30);
  }, [candidates, query]);

  const { run, pending, error } = useActionFeedback<{
    transferRequestId: string;
  }>({
    success: "Transfer request sent",
    successDescription:
      "We'll email and ping your inbox the moment the office decides.",
    onSuccess: () => router.push("/portal/classes"),
  });

  function submit() {
    run(() =>
      requestClassTransfer({
        fromEnrollmentId: enrollmentId,
        targetClassSeriesId: selected || undefined,
        note: note.trim() || undefined,
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 elev-card p-5">
        <Label htmlFor="transfer-search" className="text-sm">
          Search the catalog (optional)
        </Label>
        <Input
          id="transfer-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Tuesday Triaz beginner"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Showing {filtered.length} of {candidates.length} classes. Leave
          blank if you'd like the office to suggest one.
        </p>
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {filtered.map((c) => (
            <li key={c.id}>
              <label
                className={`flex items-start gap-3 p-3 ${
                  c.isFull ? "opacity-50" : "hover:bg-[var(--muted)]/30"
                } cursor-pointer`}
              >
                <input
                  type="radio"
                  name="target"
                  value={c.id}
                  checked={selected === c.id}
                  disabled={c.isFull}
                  onChange={() => setSelected(c.id)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.label}
                    {c.isFull ? " · full" : ""}
                  </span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    Starts{" "}
                    {new Date(c.startsOnIso).toLocaleDateString("en-NL", {
                      month: "short",
                      day: "numeric",
                    })}
                    {c.pricePerSeries != null
                      ? ` · €${c.pricePerSeries.toFixed(0)}/series`
                      : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-4 text-center text-sm text-[var(--muted-foreground)]">
              No classes match. Try a different search or leave it
              blank.
            </li>
          )}
        </ul>
      </div>

      <div className="space-y-3 elev-card p-5">
        <Label htmlFor="transfer-note" className="text-sm">
          Anything we should know? (optional)
        </Label>
        <Textarea
          id="transfer-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`Why ${studentName} would like to switch — preferred days, level, etc.`}
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button tone="triaz" loading={pending} onClick={submit}>
          {pending ? "Sending…" : "Submit transfer request"}
        </Button>
      </div>
    </div>
  );
}

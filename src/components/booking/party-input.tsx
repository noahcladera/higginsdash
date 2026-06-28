"use client";

/**
 * Chips-style "party" input: a single text field with an Add button. Each
 * confirmed name renders as a removable chip above the input.
 *
 * Two modes:
 *   - Free-text (default): plain `<Input>` + Add button. Used by Randwijck
 *     bookings and coaching bookings (where the "students" can be anyone
 *     — kids, friends, drop-ins).
 *   - Member lookup: when a `lookup` callback is passed in we render an
 *     async typeahead that resolves to a `personId` so the booking can
 *     write `BookingPartner.personId`. Heather feedback v1 — Triaz
 *     bookings now require partners to be other Triaz members so the
 *     office can spot "always playing with non-members" patterns.
 *   - Member-only (`membersOnly`): lookup required; partners must be
 *     picked from the dropdown — no free-text guest names.
 */

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface PartyEntry {
  /** Display name shown on the booking (always required). */
  partnerName: string;
  /** Set when the user picked a real member from the lookup. */
  personId?: string;
}

export interface PartnerCandidate {
  personId: string;
  name: string;
  initial: string;
  hint: string | null;
}

export type PartnerLookup = (query: string) => Promise<PartnerCandidate[]>;

export interface PartyInputProps {
  value: PartyEntry[];
  onChange: (next: PartyEntry[]) => void;
  /** Singular noun shown in the label and "Add another" CTA. */
  label: string;
  max: number;
  placeholder?: string;
  /**
   * When provided, the input becomes a typeahead. Each keystroke (after
   * 2 characters, debounced) calls the lookup and renders the matches
   * inline. Selecting a candidate sets `personId` on the new entry.
   */
  lookup?: PartnerLookup;
  /**
   * Helper text rendered below the input. Useful for explaining the
   * member-only constraint on Triaz.
   */
  helperText?: string;
  /**
   * When true (requires `lookup`), partners can only be added by
   * selecting a member from search results — no typed guest names.
   */
  membersOnly?: boolean;
}

export function PartyInput({
  value,
  onChange,
  label,
  max,
  placeholder,
  lookup,
  helperText,
  membersOnly = false,
}: PartyInputProps) {
  const [draft, setDraft] = useState("");
  const [matches, setMatches] = useState<PartnerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const lastQueryRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const atCap = value.length >= max;

  /** Read the live field value — ref first so mobile taps work if React state lags. */
  const readDraftValue = () =>
    (inputRef.current?.value ?? draft).trim();

  const syncDraft = (next: string) => {
    setDraft(next);
  };

  // Debounced lookup; clear when input shrinks below 2 chars.
  useEffect(() => {
    if (!lookup) return;
    const q = draft.trim();
    if (q.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    lastQueryRef.current = q;
    const handle = window.setTimeout(async () => {
      try {
        const result = await lookup(q);
        // Discard if the input changed while we were waiting.
        if (lastQueryRef.current !== q) return;
        setMatches(result);
      } finally {
        if (lastQueryRef.current === q) setSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [draft, lookup]);

  const addEntry = (entry: PartyEntry) => {
    if (atCap) return;
    if (!entry.partnerName.trim()) return;
    if (membersOnly && !entry.personId) return;
    onChange([...value, entry]);
    setDraft("");
    setMatches([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  /** Commit the draft field — used by Add, Enter, and mobile pointer taps. */
  const commitDraft = () => {
    const trimmed = readDraftValue();
    if (!trimmed || atCap) return;
    if (membersOnly) {
      if (matches[0]) {
        addEntry({
          partnerName: matches[0].name,
          personId: matches[0].personId,
        });
      }
      return;
    }
    const exactMatch = lookup
      ? matches.find(
          (m) =>
            m.name.localeCompare(trimmed, undefined, {
              sensitivity: "accent",
            }) === 0,
        )
      : undefined;
    if (exactMatch) {
      addEntry({
        partnerName: exactMatch.name,
        personId: exactMatch.personId,
      });
    } else {
      addEntry({ partnerName: trimmed });
    }
  };

  const remove = (idx: number) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {value.length > 0 ? `s (${value.length}/${max})` : `s · up to ${max}`}
      </Label>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((entry, i) => (
            <li
              key={`${i}-${entry.partnerName}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs",
                entry.personId
                  ? "border-[var(--triaz)] bg-[var(--triaz-soft)]"
                  : "border-[var(--border)] bg-[var(--muted)]/40",
              )}
              title={entry.personId ? "Linked to a member account" : undefined}
            >
              <span>{entry.partnerName}</span>
              {entry.personId && (
                <span
                  aria-hidden="true"
                  className="text-[10px] text-[var(--triaz-ink)]"
                >
                  ✓
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${entry.partnerName}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!atCap && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              key={value.length}
              defaultValue=""
              onChange={(e) => syncDraft(e.target.value)}
              onInput={(e) => syncDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              className="min-w-0 w-auto flex-1"
              placeholder={
                placeholder ??
                (membersOnly
                  ? `Search and select a ${label.toLowerCase()}…`
                  : lookup
                    ? `Search for a ${label.toLowerCase()}…`
                    : `Name of ${label.toLowerCase()}`)
              }
            />
            {!membersOnly && (
              <Button
                type="button"
                variant="outline"
                data-testid="party-add"
                className={cn(
                  "min-h-11 shrink-0 touch-manipulation",
                  !draft.trim() && "opacity-50",
                )}
                onPointerDown={(e) => {
                  if (!readDraftValue()) return;
                  e.preventDefault();
                  commitDraft();
                }}
                onClick={commitDraft}
              >
                Add
              </Button>
            )}
          </div>

          {lookup && draft.trim().length >= 2 && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
              {searching ? (
                <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  Searching members…
                </div>
              ) : matches.length === 0 ? (
                <div
                  className={cn(
                    "px-3 py-2 text-xs text-[var(--muted-foreground)]",
                    !membersOnly && "space-y-1",
                  )}
                >
                  {membersOnly ? (
                    "No members found — try another spelling or ask the office to look them up."
                  ) : (
                    <>
                      <div>No members found.</div>
                      <div>
                        You can still add &ldquo;{draft.trim()}&rdquo; as a guest
                        — the office may follow up to confirm membership.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {matches.map((m) => (
                    <li key={m.personId}>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          addEntry({
                            partnerName: m.name,
                            personId: m.personId,
                          });
                        }}
                        onClick={() =>
                          addEntry({
                            partnerName: m.name,
                            personId: m.personId,
                          })
                        }
                        className="flex min-h-11 w-full touch-manipulation items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--muted)]/40"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--triaz-soft)] text-xs font-medium text-[var(--triaz-ink)]"
                        >
                          {m.initial}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {m.name}
                          </span>
                          {m.hint && (
                            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                              {m.hint}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(helperText || membersOnly) && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {helperText ??
                "Search and select a fellow member — partners must have an account."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

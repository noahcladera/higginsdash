"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateSeason } from "@/lib/ladder/admin-actions";
import { useActionFeedback } from "@/lib/feedback";
import { SeasonRowActions } from "./season-row-actions";

export interface SeasonRowProps {
  season: {
    id: string;
    name: string;
    slug: string;
    startsOn: string; // YYYY-MM-DD
    endsOn: string; // YYYY-MM-DD
    joinDeadline: string | null; // YYYY-MM-DD
    entryFeeCents: number;
    challengeRange: number;
    isActive: boolean;
    notes: string | null;
    rangeLabel: string; // pretty "2026-04-01 → 2026-09-30"
    feeLabel: string;
    entryCount: number;
    matchCount: number;
  };
  anyActive: boolean;
}

/**
 * One season in the admin table. Renders a summary row plus an inline
 * edit form (in a second `<tr>` with colspan) when the user clicks
 * "Edit". Keeps the toggle state local so the rest of the table stays
 * server-rendered.
 */
export function SeasonRow({ season, anyActive }: SeasonRowProps) {
  const [editing, setEditing] = React.useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-2">
          <Link
            href={`/portal/ladder/seasons/${season.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {season.name}
          </Link>
          <div className="text-xs text-[var(--muted-foreground)]">
            ±{season.challengeRange}
          </div>
        </td>
        <td className="px-4 py-2 text-xs tabular">{season.rangeLabel}</td>
        <td className="px-4 py-2 text-right tabular">{season.entryCount}</td>
        <td className="px-4 py-2 text-right tabular">{season.matchCount}</td>
        <td className="px-4 py-2 text-right tabular">{season.feeLabel}</td>
        <td className="px-4 py-2">
          {season.isActive ? (
            <Badge tone="success" variant="soft">
              active
            </Badge>
          ) : (
            <Badge variant="outline">closed</Badge>
          )}
        </td>
        <td className="px-4 py-2 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                tone="neutral"
                size="sm"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Cancel" : "Edit"}
              </Button>
              <SeasonRowActions
                seasonId={season.id}
                isActive={season.isActive}
                anyActive={anyActive}
              />
            </div>
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="bg-[var(--surface-strong)]/50">
          <td colSpan={7} className="px-4 py-4">
            <EditSeasonForm
              season={season}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EditSeasonForm({
  season,
  onDone,
}: {
  season: SeasonRowProps["season"];
  onDone: () => void;
}) {
  const { run, pending, error } = useActionFeedback({
    success: `${season.name} updated`,
    onSuccess: onDone,
  });

  const submit = (formData: FormData) => {
    const payload = {
      seasonId: season.id,
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: String(formData.get("endsOn") ?? ""),
      joinDeadline: String(formData.get("joinDeadline") ?? ""),
      entryFeeCents: Number(formData.get("entryFeeCents") ?? season.entryFeeCents),
      challengeRange: Number(
        formData.get("challengeRange") ?? season.challengeRange,
      ),
      notes: String(formData.get("notes") ?? ""),
    };
    run(() => updateSeason(payload));
  };

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      <Field
        name="name"
        label="Name"
        defaultValue={season.name}
        required
      />
      <Field
        name="slug"
        label="Slug"
        defaultValue={season.slug}
        required
        hint="Lowercase letters, numbers and dashes."
      />
      <Field
        name="startsOn"
        label="Starts"
        type="date"
        defaultValue={season.startsOn}
        required
      />
      <Field
        name="endsOn"
        label="Ends"
        type="date"
        defaultValue={season.endsOn}
        required
      />
      <Field
        name="joinDeadline"
        label="Join deadline"
        type="date"
        defaultValue={season.joinDeadline ?? ""}
        hint="Optional — last day to join."
      />
      <Field
        name="entryFeeCents"
        label="Entry fee (cents)"
        type="number"
        defaultValue={String(season.entryFeeCents)}
        hint="Set 0 for free."
      />
      <Field
        name="challengeRange"
        label="Challenge range (±)"
        type="number"
        defaultValue={String(season.challengeRange)}
      />
      <div className="sm:col-span-2">
        <label className="block text-xs text-[var(--muted-foreground)]">
          Notes
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={season.notes ?? ""}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
        {error && (
          <span className="text-xs text-[var(--destructive)]">{error}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" tone="triaz" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-foreground)]">
        {label}
      </label>
      <input
        name={name}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm"
        {...rest}
      />
      {hint && (
        <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
          {hint}
        </p>
      )}
    </div>
  );
}

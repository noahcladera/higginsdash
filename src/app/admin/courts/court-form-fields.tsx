"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionFeedback } from "@/lib/feedback";
import type { SimpleActionResult } from "@/lib/feedback/types";

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

export function CourtFormFields({
  action,
  court,
  returnTo,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult>;
  court: {
    id: string;
    name: string;
    displayOrder: number;
    surface: string;
    qualityTier: string;
    isBookable: boolean;
    notes: string | null;
  };
  returnTo: string;
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Court saved",
    errorTitle: "Couldn't save court",
    returnTo,
  });

  return (
    <form action={(fd) => run(() => action(fd))} className="max-w-md space-y-4">
      <input type="hidden" name="courtId" value={court.id} />
      <div className="space-y-1">
        <Label htmlFor="name">Court name</Label>
        <Input id="name" name="name" defaultValue={court.name} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="displayOrder">Display order</Label>
        <Input
          id="displayOrder"
          name="displayOrder"
          type="number"
          min={0}
          step={1}
          defaultValue={court.displayOrder}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Lower numbers appear first in the booking calendar. Use this to put
          Court 4 before Court 3, etc.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="surface">Surface</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Used by staff when planning lessons and operations.
        </p>
        <select
          id="surface"
          name="surface"
          className={selectClass}
          defaultValue={court.surface}
        >
          <option value="clay">Clay</option>
          <option value="hard">Hard</option>
          <option value="indoor_hard">Indoor hard</option>
          <option value="grass">Grass</option>
          <option value="multi_use">Multi-use</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="qualityTier">Tier</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Distinguish premium spaces from practice and walk-on areas.
        </p>
        <select
          id="qualityTier"
          name="qualityTier"
          className={selectClass}
          defaultValue={court.qualityTier}
        >
          <option value="premium">Premium</option>
          <option value="standard">Standard</option>
          <option value="practice_only">Practice only</option>
          <option value="walk_on_only">Walk-on only</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="isBookable"
          name="isBookable"
          defaultChecked={court.isBookable}
        />
        <Label htmlFor="isBookable">Bookable (uncheck for walk-on only)</Label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Internal notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={court.notes ?? ""}
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" tone="triaz" loading={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button asChild variant="outline" type="button">
          <Link href={returnTo}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

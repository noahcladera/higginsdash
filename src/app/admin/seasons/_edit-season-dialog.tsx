"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionFeedback } from "@/lib/feedback";
import type { SeasonAudience } from "@prisma/client";
import { updateSeason } from "./actions";
import {
  SeasonAudiencePills,
  SeasonDateFields,
  SeasonNameField,
  SeasonNotesField,
  SeasonSlugField,
} from "./_season-form-fields";

export type SeasonEditRow = {
  id: string;
  name: string;
  slug: string;
  audience: SeasonAudience;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
};

export function EditSeasonDialog({
  season,
  open,
  onOpenChange,
}: {
  season: SeasonEditRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [audience, setAudience] = useState<SeasonAudience>("youth");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!season) return;
    setAudience(season.audience);
    setName(season.name);
    setSlug(season.slug);
    setStartsOn(season.startsOn ?? "");
    setEndsOn(season.endsOn ?? "");
    setNotes(season.notes ?? "");
  }, [season]);

  const { run, pending } = useActionFeedback<{ seasonId: string }>({
    success: (r) => r.message ?? "Season updated",
    onSuccess: () => onOpenChange(false),
  });

  if (!season) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Edit season</DialogTitle>
          <DialogDescription>
            Update the label, audience, or optional date window. Classes keep
            their own enrollment settings.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("seasonId", season.id);
            run(() => updateSeason(fd));
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="audience" value={audience} />

          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium">Audience</span>
            <SeasonAudiencePills
              value={audience}
              onChange={setAudience}
              disabled={pending}
            />
          </div>

          <SeasonNameField
            value={name}
            onChange={setName}
            disabled={pending}
          />
          <SeasonDateFields
            audience={audience}
            showDates
            startsOn={startsOn}
            endsOn={endsOn}
            onStartsOnChange={setStartsOn}
            onEndsOnChange={setEndsOn}
            disabled={pending}
          />
          <SeasonSlugField
            value={slug}
            onChange={setSlug}
            disabled={pending}
          />
          <SeasonNotesField
            value={notes}
            onChange={setNotes}
            disabled={pending}
          />

          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              tone="triaz"
              loading={pending}
              disabled={pending || !name.trim()}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import type { SeasonAudience } from "@prisma/client";
import { createSeason } from "./actions";
import {
  SeasonAudiencePills,
  SeasonDateFields,
  SeasonNameField,
  SeasonNotesField,
} from "./_season-form-fields";

/**
 * Tiered create form for catalog seasons on /admin/seasons.
 *
 * 1. Audience (youth / adult)
 * 2. Name (manual)
 * 3. Dates — youth only on create; adult seasons are label-only until edited
 */
export function NewSeasonForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [audience, setAudience] = useState<SeasonAudience>("youth");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");

  const { run, pending } = useActionFeedback<{ seasonId: string }>({
    success: (r) => r.message ?? "Season created",
    onSuccess: () => {
      formRef.current?.reset();
      setAudience("youth");
      setName("");
      setStartsOn("");
      setEndsOn("");
      setNotes("");
    },
  });

  const showDates = audience === "youth";

  return (
    <form
      ref={formRef}
      action={(fd) => run(() => createSeason(fd))}
      className="space-y-5 elev-card rounded-[var(--radius-md)] p-5"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Seasons group classes and help name them. Enrollment timing is set on
        each class, not here.
      </p>

      <input type="hidden" name="audience" value={audience} />

      <div className="space-y-2">
        <span className="text-sm font-medium">Audience</span>
        <SeasonAudiencePills
          value={audience}
          onChange={setAudience}
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SeasonNameField
          value={name}
          onChange={setName}
          disabled={pending}
        />
        <SeasonDateFields
          audience={audience}
          showDates={showDates}
          startsOn={startsOn}
          endsOn={endsOn}
          onStartsOnChange={setStartsOn}
          onEndsOnChange={setEndsOn}
          disabled={pending}
        />
        <SeasonNotesField
          value={notes}
          onChange={setNotes}
          disabled={pending}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" tone="triaz" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create season"}
        </Button>
      </div>
    </form>
  );
}

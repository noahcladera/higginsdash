"use client";

import { useState, useTransition } from "react";
import { upsertSeriesFeedback } from "@/lib/medals/feedback-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CoachSeriesFeedback({
  enrollmentId,
  initialBody,
  initialVisibility,
}: {
  enrollmentId: string;
  initialBody: string;
  initialVisibility: "coach_only" | "parent_visible";
}) {
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [hint, setHint] = useState<"saving" | "saved" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setHint("saving");
    setError(null);
    startTransition(async () => {
      try {
        await upsertSeriesFeedback({ enrollmentId, body, visibility });
        setHint("saved");
        setTimeout(() => setHint(null), 1500);
      } catch (e) {
        setHint("error");
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-2 min-w-[16rem]">
      <Label className="text-xs text-[var(--muted-foreground)]">
        Season feedback
      </Label>
      <Textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="2–3 sentences for this programme…"
        className="text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Feedback visibility"
          value={visibility}
          onChange={(e) =>
            setVisibility(e.target.value as "coach_only" | "parent_visible")
          }
          className="h-8 rounded-md border border-[var(--border)] bg-transparent px-2 text-xs"
        >
          <option value="coach_only">Coach only</option>
          <option value="parent_visible">Parents can see</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save feedback"}
        </Button>
        <span
          className={
            "text-xs " +
            (hint === "error"
              ? "text-[var(--destructive)]"
              : "text-[var(--muted-foreground)]")
          }
          aria-live="polite"
        >
          {hint === "saved"
            ? "Saved"
            : hint === "error"
              ? (error ?? "Save failed")
              : ""}
        </span>
      </div>
    </div>
  );
}

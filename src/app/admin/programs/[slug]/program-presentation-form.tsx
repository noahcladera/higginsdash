"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { updateProgramPresentation } from "../actions";

/**
 * Program presentation editor.
 *
 * Two fields, both parent-facing:
 *
 *   - Cover image: the hero image at the top of the program page.
 *     16:9 to match the card grid in /admin/programs and the portal.
 *   - Public description: one to three sentences that answer "what
 *     is this, and who is it for?". Kept as a textarea without markdown
 *     until we have a real editor — simpler than hinting at rich text
 *     we can't yet render.
 */
export function ProgramPresentationForm({
  programId,
  defaultCoverImageUrl,
  defaultDescriptionPublic,
}: {
  programId: string;
  defaultCoverImageUrl: string;
  defaultDescriptionPublic: string;
}) {
  const [coverImageUrl, setCoverImageUrl] = React.useState(defaultCoverImageUrl);
  const [descriptionPublic, setDescriptionPublic] = React.useState(
    defaultDescriptionPublic,
  );
  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const form = new FormData();
    form.set("id", programId);
    form.set("coverImageUrl", coverImageUrl);
    form.set("descriptionPublic", descriptionPublic);
    try {
      const result = await updateProgramPresentation(form);
      if (result.ok) setStatus({ kind: "saved" });
      else setStatus({ kind: "error", message: result.error });
    } catch {
      setStatus({
        kind: "error",
        message: "Save failed. Check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <ImageUpload
        name="coverImageUrl"
        defaultUrl={coverImageUrl}
        kind="cover"
        aspect="16/9"
        label="Cover image"
        helpText="Shown at the top of the program page parents see when deciding whether to sign up. Landscape photos work best — 1600×900 or larger."
        onChange={(next) => setCoverImageUrl(next)}
      />

      <div className="space-y-2">
        <Label htmlFor="description-public">Public description</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          One to three sentences. Answer "what is this and who is it for?" in
          parent-friendly language.
        </p>
        <Textarea
          id="description-public"
          name="descriptionPublic"
          rows={5}
          value={descriptionPublic}
          onChange={(e) => setDescriptionPublic(e.target.value)}
          placeholder="Example: Group lessons for kids aged 6–9 who are new to tennis. Runs every Saturday morning at Triaz — racquets provided."
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Saving…" : "Save"}
        </Button>
        {status.kind === "saved" && (
          <span className="text-sm text-[var(--muted-foreground)]">
            Saved.
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-sm text-[var(--destructive)]">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}

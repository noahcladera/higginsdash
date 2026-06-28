"use client";

import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import type { SimpleActionResult } from "@/lib/feedback/types";

export function LevelContentForm({
  action,
  returnTo,
  row,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult>;
  returnTo: string;
  row: {
    skillLevel: string;
    title: string;
    shortDescription: string | null;
    longDescription: string;
    howToGraduate: string | null;
    sortOrder: number;
    videoUrl: string | null;
  };
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Level saved",
    errorTitle: "Couldn't save level",
    returnTo,
  });

  return (
    <form action={(fd) => run(() => action(fd))} className="max-w-2xl space-y-4">
      <input type="hidden" name="skillLevel" value={row.skillLevel} />
      <div>
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={row.title}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="shortDescription" className="text-sm font-medium">
          Short description
        </label>
        <input
          id="shortDescription"
          name="shortDescription"
          defaultValue={row.shortDescription ?? ""}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="longDescription" className="text-sm font-medium">
          Long description
        </label>
        <textarea
          id="longDescription"
          name="longDescription"
          rows={10}
          defaultValue={row.longDescription}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="howToGraduate" className="text-sm font-medium">
          How to graduate (free-text companion to the criteria checklist)
        </label>
        <textarea
          id="howToGraduate"
          name="howToGraduate"
          rows={5}
          placeholder="A couple of paragraphs on what your child needs to show before moving up. The structured criteria below drive day-to-day promotions."
          defaultValue={row.howToGraduate ?? ""}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="sortOrder" className="text-sm font-medium">
          Sort order
        </label>
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={row.sortOrder}
          className="mt-1 w-32 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="videoUrl" className="text-sm font-medium">
          Video URL
        </label>
        <input
          id="videoUrl"
          name="videoUrl"
          placeholder="YouTube, Vimeo, or direct .mp4"
          defaultValue={row.videoUrl ?? ""}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}
      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

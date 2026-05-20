/**
 * Server-rendered form for posting a class update. Lives next to the
 * recent updates list on `/coach/classes/[seriesId]` and (optionally)
 * on `/coach/classes/[seriesId]/sessions/[sessionId]`.
 */

import { Button } from "@/components/ui/button";
import { postClassUpdate } from "@/lib/class-updates/actions";

interface Props {
  classSeriesId: string;
  /** Pin the update to a single session (Wed special exercise, etc.). */
  classSessionId?: string;
}

export function PostClassUpdateForm({ classSeriesId, classSessionId }: Props) {
  return (
    <form
      action={postClassUpdate}
      className="space-y-3 rounded-md border border-dashed border-[var(--border)] p-4"
    >
      <input type="hidden" name="classSeriesId" value={classSeriesId} />
      {classSessionId && (
        <input type="hidden" name="classSessionId" value={classSessionId} />
      )}
      <div>
        <label htmlFor="title" className="text-xs font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="What did you cover today?"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="body" className="text-xs font-medium">
          Note for parents
        </label>
        <textarea
          id="body"
          name="body"
          rows={4}
          placeholder="Optional — what went well, what they're working on, anything to practice at home."
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="videoUrl" className="text-xs font-medium">
          YouTube or Vimeo link (optional)
        </label>
        <input
          id="videoUrl"
          name="videoUrl"
          inputMode="url"
          placeholder="https://youtu.be/…"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Paste a link from your phone — we&apos;ll grab the thumbnail
          and embed the video for you.
        </p>
      </div>
      <Button type="submit">Post update</Button>
    </form>
  );
}

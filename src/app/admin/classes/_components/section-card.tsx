"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shell for an editable section on the locked class-edit page.
 *
 * Starts in `locked` state showing a read-only summary (children of
 * `read`). The admin clicks "Edit" to unlock, at which point the
 * `edit` children render inside a real <form> whose submit calls the
 * server `action`. On success the form closes itself back to locked.
 *
 * Cancel discards any in-flight edits by remounting the edit children
 * via a bumped `editKey` (so uncontrolled inputs reset to defaults).
 */
export function SectionCard({
  title,
  description,
  action,
  read,
  edit,
  submitLabel = "Save changes",
}: {
  title: string;
  description?: string;
  action: (formData: FormData) => Promise<void> | void;
  read: React.ReactNode;
  edit: React.ReactNode;
  submitLabel?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    setIsEditing(false);
    setError(null);
    // Bump the key so re-entering the editor resets any uncontrolled
    // fields to their current server-side defaults (not whatever the
    // user left mid-edit).
    setEditKey((k) => k + 1);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setIsEditing(false);
        setEditKey((k) => k + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {!isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        )}
      </header>

      {!isEditing ? (
        <div className="px-5 py-4">{read}</div>
      ) : (
        <form action={onSubmit} key={editKey} className="space-y-4 px-5 py-4">
          {edit}
          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" tone="triaz" size="sm" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </footer>
        </form>
      )}
    </section>
  );
}

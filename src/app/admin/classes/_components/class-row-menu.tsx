"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVerticalIcon } from "@/components/icons";
import { useTerms } from "@/components/tenant/terms-provider";
import { applyTerms } from "@/lib/tenant/terms";
import {
  deleteClassSeries,
  duplicateClassSeries,
} from "@/app/admin/classes/actions";

/**
 * Per-row kebab menu shown on the admin classes list. Wraps the
 * `Open editor` link plus two server-action forms (Duplicate /
 * Delete) so the row's right edge stays narrow even with very long
 * derived names. Delete opens a confirmation dialog before
 * submitting `deleteClassSeries`, which decides at the server
 * whether to hard-delete or soft-archive the series.
 */
export function ClassRowMenu({
  seriesId,
  seriesName,
}: {
  seriesId: string;
  seriesName: string;
}) {
  const t = useTerms();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const duplicateFormRef = useRef<HTMLFormElement | null>(null);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);

  function handleDuplicate() {
    setMenuOpen(false);
    startTransition(() => {
      duplicateFormRef.current?.requestSubmit();
    });
  }

  function handleDeleteConfirm() {
    setDeleteOpen(false);
    startTransition(() => {
      deleteFormRef.current?.requestSubmit();
    });
  }

  const classSingular = t.class.singular.toLowerCase();

  return (
    <>
      <form
        ref={duplicateFormRef}
        action={duplicateClassSeries}
        className="hidden"
      >
        <input type="hidden" name="classSeriesId" value={seriesId} />
      </form>
      <form
        ref={deleteFormRef}
        action={deleteClassSeries}
        className="hidden"
      >
        <input type="hidden" name="classSeriesId" value={seriesId} />
      </form>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{seriesName}&rdquo;?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {applyTerms(
                    "This will remove this {class.singular} from your list. " +
                      "{class.plural} with no {enrollment.plural} and no " +
                      "completed lessons are deleted permanently.",
                    t,
                  )}
                </p>
                <p>
                  {applyTerms(
                    "Anything with attendance, {enrollment.plural}, or " +
                      "payments is cancelled and hidden instead so your " +
                      "records stay intact.",
                    t,
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleDeleteConfirm}
            >
              {pending ? "Deleting…" : `Delete ${classSingular}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Class actions"
            disabled={pending}
            className="h-8 w-8 p-0"
          >
            <EllipsisVerticalIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/admin/classes/${seriesId}`}>Open editor</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleDuplicate();
            }}
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

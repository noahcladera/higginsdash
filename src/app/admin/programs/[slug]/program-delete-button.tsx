"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteProgram, type DeleteProgramResult } from "../actions";

export function ProgramDeleteButton({
  programId,
  programName,
  programSingular,
  seriesCount,
}: {
  programId: string;
  programName: string;
  programSingular: string;
  seriesCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    setError(null);
    if (
      !window.confirm(
        `Delete “${programName}”? This cannot be undone. There must be no class series attached.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const result: DeleteProgramResult = await deleteProgram(programId);
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }
      router.replace("/admin/programs");
      router.refresh();
    } catch {
      setError("Delete failed. Try again.");
      setPending(false);
    }
  }

  const blocked = seriesCount > 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
      <h2 className="text-sm font-semibold text-[var(--destructive)]">
        Danger zone
      </h2>
      <p className="text-sm text-[var(--muted-foreground)]">
        {blocked ? (
          <>
            This {programSingular.toLowerCase()} has{" "}
            <strong>{seriesCount}</strong> class series. Remove or reassign them
            under{" "}
            <Link href="/admin/classes" className="underline underline-offset-2">
              Classes
            </Link>{" "}
            before deleting.
          </>
        ) : (
          `Delete this ${programSingular.toLowerCase()} only when no class series reference it.`
        )}
      </p>
      <Button
        type="button"
        variant="destructive"
        disabled={pending || blocked}
        onClick={onDelete}
      >
        {pending ? "Deleting…" : `Delete ${programSingular.toLowerCase()}`}
      </Button>
      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}
    </div>
  );
}

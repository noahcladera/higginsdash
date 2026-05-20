"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CoachError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[coach] route error:", error);
  }, [error]);

  return (
    <div className="space-y-8">
      <EmptyState
        title="Something went sideways"
        description="We couldn't load this view. Have another go, or jump back to today."
        action={
          <div className="flex items-center justify-center gap-2">
            <Button onClick={reset} tone="triaz">
              Try again
            </Button>
            <Button asChild variant="ghost" tone="neutral">
              <Link href="/coach">Back to today</Link>
            </Button>
          </div>
        }
      />
      {error.digest && (
        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Error ID · {error.digest}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Member-portal error boundary. Keeps the chrome (sidebar) and shows a
 * friendly card with a retry. Reports the error to the console so devtools
 * still surfaces the stack.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] route error:", error);
  }, [error]);

  return (
    <div className="space-y-8">
      <EmptyState
        title="Something went sideways"
        description="We hit a snag loading this page. Try again, or head back home."
        action={
          <div className="flex items-center justify-center gap-2">
            <Button onClick={reset} tone="triaz">
              Try again
            </Button>
            <Button asChild variant="ghost" tone="neutral">
              <Link href="/portal">Back to overview</Link>
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

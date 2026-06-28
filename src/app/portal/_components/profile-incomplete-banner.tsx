"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Soft interstitial when contact details are incomplete. On mobile the
 * missing-field list collapses so Book / quick actions stay above the fold.
 */
export function ProfileIncompleteBanner({
  missing,
}: {
  missing: string[];
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="alert-glass-warning p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Badge tone="warning" variant="solid">
            Action needed
          </Badge>
          <h2 className="font-display text-lg font-medium tracking-tight">
            Please complete your contact details
          </h2>
          <p className="max-w-prose text-sm text-[var(--foreground)] md:block">
            <span className="md:hidden">
              Coaches and the office need this for emergencies.
            </span>
            <span className="hidden md:inline">
              We&apos;re tightening the records so coaches and the office can
              reach you fast in an emergency. The following are still blank on
              your profile:
            </span>
          </p>

          {/* Mobile: expand for field list */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--foreground)] underline-offset-4 hover:underline md:hidden"
            aria-expanded={expanded}
          >
            {missing.length} field{missing.length === 1 ? "" : "s"} missing
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          <ul
            className={cn(
              "text-sm text-[var(--foreground)]",
              "hidden md:block",
              expanded && "block md:block",
            )}
          >
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
        <Button asChild tone="triaz" size="sm" className="min-h-11 shrink-0">
          <Link href="/portal/profile">Complete my profile</Link>
        </Button>
      </div>
    </div>
  );
}

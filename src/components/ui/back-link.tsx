import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * BackLink — the single back-navigation affordance for portal + coach
 * detail pages. Always rendered above the page header (never tucked into
 * the header `actions` slot) with a consistent arrow + muted styling, so
 * "go up a level" looks and sits the same everywhere.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-[var(--foreground)] hover:underline",
        className,
      )}
    >
      <ArrowLeftIcon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";

/**
 * Points enrolled members at the portal inbox for rain/cancel updates.
 * Email analysis showed parents email Heather when WhatsApp misses them;
 * this makes the authoritative channel visible on My Classes.
 */
export function ScheduleUpdatesBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 elev-card px-5 py-4">
      <div className="space-y-1 text-sm">
        <div className="font-semibold">Rain or schedule change?</div>
        <p className="text-[var(--muted-foreground)]">
          Cancellations and class updates land in your portal inbox first —
          check there before emailing the office.
        </p>
      </div>
      <Button asChild tone="triaz" size="sm" variant="outline">
        <Link href="/portal/inbox">
          Open inbox <ArrowRightIcon size={14} />
        </Link>
      </Button>
    </div>
  );
}

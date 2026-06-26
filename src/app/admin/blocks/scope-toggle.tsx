"use client";

import type { RecurringBlockScope } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/feedback";
import { updateBlockScope } from "./actions";

const LABEL: Record<RecurringBlockScope, string> = {
  full: "Full block",
  members_only: "Members only",
};

const TONE: Record<RecurringBlockScope, string> = {
  full: "border-[var(--warning)]/50 bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  members_only: "border-sky-300 bg-sky-50 text-sky-900",
};

/**
 * Inline pill that flips a block between "Full" and "Members only" via the
 * `updateBlockScope` server action. Editable rows live in the Others/External
 * section of /admin/blocks; lesson rows render `<ScopeBadge>` instead.
 */
export function ScopeToggle({
  blockId,
  scope,
}: {
  blockId: string;
  scope: RecurringBlockScope;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<RecurringBlockScope>(scope);

  const next: RecurringBlockScope =
    optimistic === "full" ? "members_only" : "full";

  return (
    <button
      type="button"
      onClick={() => {
        const target = next;
        setOptimistic(target);
        startTransition(async () => {
          const res = await updateBlockScope({ id: blockId, scope: target });
          if (!res.ok) {
            setOptimistic(scope);
            toast.error("Couldn't update block", { description: res.error });
            return;
          }
          toast.success(`Switched to ${LABEL[target]}`);
          router.refresh();
        });
      }}
      disabled={isPending}
      title={`Click to switch to "${LABEL[next]}"`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-60 ${TONE[optimistic]}`}
    >
      {LABEL[optimistic]}
      <span className="text-[9px] uppercase tracking-wide opacity-70">
        edit
      </span>
    </button>
  );
}

/** Read-only badge for blocks whose scope can't be changed (lessons). */
export function ScopeBadge({ scope }: { scope: RecurringBlockScope }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[scope]}`}
    >
      {LABEL[scope]}
    </span>
  );
}

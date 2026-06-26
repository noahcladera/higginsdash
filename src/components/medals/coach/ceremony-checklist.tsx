"use client";

import { useEffect, useState } from "react";
import { CEREMONY_CHECKLIST } from "@/lib/medals/curriculum";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "higgins-medals-ceremony-checklist";

export function CeremonyChecklist({ id }: { id?: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(itemId: string) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <ul
      id={id}
      className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      {CEREMONY_CHECKLIST.map((item) => {
        const isChecked = checked[item.id] ?? false;
        return (
          <li key={item.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--muted)]/40",
                isChecked && "opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
              />
              <span
                className={cn(
                  "text-sm leading-relaxed",
                  isChecked && "line-through",
                )}
              >
                {item.label}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

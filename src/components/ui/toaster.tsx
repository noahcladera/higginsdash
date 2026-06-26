"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Single global toaster for the whole app. Mounted once in the root
 * layout — every `toast(...)` call from anywhere bubbles here.
 *
 * Visual choices follow Liquid Paper tokens in `globals.css`:
 *
 *   - Top-right placement on desktop so feedback doesn't fight the
 *     thumb zone, but Sonner already collapses to bottom-center on
 *     mobile via its responsive defaults.
 *   - `richColors` so success / error / warning all read at a glance
 *     without forcing every callsite to spell out a tone.
 *   - No close button. Toasts auto-dismiss; if the user needs the
 *     info to persist, the page itself is the source of truth.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton={false}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "glass-panel-strong !rounded-[var(--radius-md)] !border-[var(--glass-border-subtle)]",
          title: "!font-medium",
          description: "!text-[var(--muted-foreground)]",
        },
      }}
    />
  );
}

"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "./types";

/**
 * Standard plumbing for "click → run server action → toast → refresh".
 *
 * Replaces the dozens of `useTransition` + `useState<error>` +
 * `router.refresh()` patterns scattered across the portal/admin/coach
 * surfaces. One place to change the feedback model app-wide.
 *
 * Usage:
 *
 * ```ts
 * const { run, pending, error } = useActionFeedback({
 *   success: "Child added",
 *   onSuccess: () => setOpen(false),
 * });
 * // ...
 * <form action={(fd) => run(() => addChildToHousehold(fd))}>
 * ```
 *
 * Conventions:
 *
 *   - Success toasts default to a generic "Saved" line; pass a
 *     specific `success` for high-signal moments (mutation worth
 *     calling out).
 *   - Error toasts surface the server's `error` string verbatim.
 *     Server actions own the copy.
 *   - The hook also keeps the last error in local state so callers
 *     that prefer an inline message under a form can still render it
 *     without re-implementing the transition logic.
 *   - `refresh: false` opts out of `router.refresh()` for actions
 *     that already redirect or revalidate via their own mechanism.
 */
export interface UseActionFeedbackOptions<T> {
  /** Toast title shown on success. Defaults to "Saved". */
  success?: string | ((result: Extract<ActionResult<T>, { ok: true }>) => string);
  /** Toast description (subline) shown on success. */
  successDescription?:
    | string
    | ((result: Extract<ActionResult<T>, { ok: true }>) => string | undefined);
  /** Optional error title; the server's `error` string becomes the description. */
  errorTitle?: string;
  /** Run after a successful action, before refresh. */
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  /** Run after a failed action. Useful for closing optimistic UI. */
  onError?: (error: string) => void;
  /** Whether to call `router.refresh()` on success. Defaults to true. */
  refresh?: boolean;
  /** Suppress the success toast (still calls `onSuccess`). */
  silentSuccess?: boolean;
}

export interface ActionFeedbackHandle<T> {
  run: (action: () => Promise<ActionResult<T>>) => void;
  pending: boolean;
  /**
   * Last error string returned by an action. Cleared when a new
   * `run` starts so inline error rows don't go stale.
   */
  error: string | null;
  /** Manually clear the inline error (e.g. when closing a dialog). */
  clearError: () => void;
}

import { useState } from "react";

export function useActionFeedback<T = void>(
  options: UseActionFeedbackOptions<T> = {},
): ActionFeedbackHandle<T> {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (action: () => Promise<ActionResult<T>>) => {
      setError(null);
      startTransition(async () => {
        let result: ActionResult<T>;
        try {
          result = await action();
        } catch (err) {
          // Server actions that call `redirect()` raise NEXT_REDIRECT
          // synchronously on the success path. We must let that bubble
          // so Next.js can perform the navigation.
          if (isRedirectError(err)) throw err;
          // Server actions shouldn't throw on expected failures, but
          // if one does we still want a visible toast instead of a
          // silent dead button.
          const msg =
            err instanceof Error
              ? err.message
              : "Something went wrong. Try again.";
          setError(msg);
          options.onError?.(msg);
          toast.error(options.errorTitle ?? "Couldn't complete that", {
            description: msg,
          });
          return;
        }

        if (!result.ok) {
          setError(result.error);
          options.onError?.(result.error);
          toast.error(options.errorTitle ?? "Couldn't complete that", {
            description: result.error,
          });
          return;
        }

        const okResult = result as Extract<ActionResult<T>, { ok: true }>;

        if (!options.silentSuccess) {
          const title =
            typeof options.success === "function"
              ? options.success(okResult)
              : options.success ??
                ("message" in okResult && typeof okResult.message === "string"
                  ? okResult.message
                  : "Saved");
          const description =
            typeof options.successDescription === "function"
              ? options.successDescription(okResult)
              : options.successDescription;
          toast.success(title, description ? { description } : undefined);
        }

        options.onSuccess?.(okResult);

        if (options.refresh !== false) {
          router.refresh();
        }
      });
    },
    [options, router],
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}

function isRedirectError(err: unknown): boolean {
  if (err instanceof Error && err.message === "NEXT_REDIRECT") return true;
  if (
    err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    return true;
  }
  return false;
}

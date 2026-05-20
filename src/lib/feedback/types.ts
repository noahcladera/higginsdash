/**
 * Action result discriminated union used by every server action that
 * mutates state.
 *
 * Two principles:
 *
 *   - Server actions never throw on expected failures (validation,
 *     auth, business rule). They return `{ ok: false, error }`. Throws
 *     are reserved for true exceptions and surface as the route's
 *     error boundary.
 *   - Client callers should use {@link useActionFeedback} (or a thin
 *     wrapper of it) to translate this shape into a toast. Don't fork
 *     a different result shape per action — the type aliases below
 *     extend `BaseActionResult<T>` so the hook stays generic.
 */
export type ActionResult<T = void> =
  | (T extends void
      ? { ok: true; message?: string }
      : { ok: true; message?: string } & T)
  | { ok: false; error: string };

/**
 * Convenience: an action that returns nothing on success.
 */
export type SimpleActionResult = ActionResult<void>;

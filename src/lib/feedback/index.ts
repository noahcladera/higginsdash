/**
 * Public surface of the feedback layer.
 *
 * Importers can do `import { useActionFeedback, toast } from "@/lib/
 * feedback"` and get the hook + the raw sonner `toast` for one-off
 * non-action notifications (e.g. "Copied to clipboard").
 */
export type { ActionResult, SimpleActionResult } from "./types";
export {
  useActionFeedback,
  type UseActionFeedbackOptions,
  type ActionFeedbackHandle,
} from "./use-action-feedback";
export { toast } from "sonner";

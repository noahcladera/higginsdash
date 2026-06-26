import { SchoolFormFields } from "./school-form-fields";
import type { SimpleActionResult } from "@/lib/feedback/types";

/**
 * Shared school create/edit form.
 */
export function SchoolForm({
  action,
  submitLabel,
  school,
  returnTo,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult | void>;
  submitLabel: string;
  returnTo?: string;
  school?: {
    id: string;
    slug: string;
    name: string;
    coachArriveAtHubMinutes: number;
    notes: string | null;
  };
}) {
  return (
    <SchoolFormFields
      action={action}
      submitLabel={submitLabel}
      school={school}
      returnTo={returnTo}
    />
  );
}

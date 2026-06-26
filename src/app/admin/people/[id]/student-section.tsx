"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/lib/feedback";
import { updateStudent } from "../actions";
import { SchoolSelect } from "./school-select";

export type StudentRow = {
  enrollmentStatus: "active" | "paused" | "archived";
  school: string | null;
  medicalNotes: string | null;
};

/**
 * Edit the non-level Student fields (status / school / medical notes).
 * Skill level is owned by the LevelInlineSelect in the Person hero card.
 */
export function StudentSection({
  personId,
  student,
}: {
  personId: string;
  student: StudentRow;
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Student details saved",
    errorTitle: "Couldn't save student details",
  });

  return (
    <form
      action={(formData) => run(() => updateStudent(personId, formData))}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="enrollmentStatus">Enrollment status</Label>
          <select
            id="enrollmentStatus"
            name="enrollmentStatus"
            defaultValue={student.enrollmentStatus}
            className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>School</Label>
          <SchoolSelect name="school" defaultValue={student.school} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="medicalNotes">Medical notes</Label>
          <Textarea
            id="medicalNotes"
            name="medicalNotes"
            rows={3}
            defaultValue={student.medicalNotes ?? ""}
            placeholder="Allergies, conditions, etc."
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save student details"}
        </Button>
      </div>
    </form>
  );
}

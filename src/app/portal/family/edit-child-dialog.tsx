"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/sheet-dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { FormField, FormPanel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SchoolSelect } from "@/app/admin/people/[id]/school-select";
import { ImageUpload } from "@/components/ui/image-upload";
import { useActionFeedback } from "@/lib/feedback";
import { updateChildProfile } from "./actions";

export interface EditChildInitial {
  personId: string;
  firstName: string;
  lastName: string;
  dateOfBirthIso: string | null; // YYYY-MM-DD or null
  school: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  avatarUrl: string | null;
}

/**
 * Edit dialog launched from the per-child hero card. Only allows the
 * parent-editable fields — skill level + medical notes are admin/coach
 * territory by design.
 */
export function EditChildDialog({ child }: { child: EditChildInitial }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, clearError } = useActionFeedback({
    success: `${child.firstName}'s profile updated`,
    onSuccess: () => setOpen(false),
  });

  function onSubmit(formData: FormData) {
    run(() => updateChildProfile(child.personId, formData));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {child.firstName}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <ImageUpload
            name="avatarUrl"
            defaultUrl={child.avatarUrl}
            kind="photo"
            aspect="square"
            label="Profile photo"
            showStockPicker={false}
            helpText="Optional — shown on the family page."
          />
          <FormPanel className="sm:grid-cols-2">
            <FormField label="First name" name="firstName" required>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={child.firstName}
                required
              />
            </FormField>
            <FormField label="Last name" name="lastName">
              <Input
                id="lastName"
                name="lastName"
                defaultValue={child.lastName}
              />
            </FormField>
            <FormField label="Date of birth" name="dateOfBirth" wide>
              <DateField
                id="dateOfBirth"
                name="dateOfBirth"
                defaultValue={child.dateOfBirthIso ?? ""}
                mode="dob"
                locale="en-NL"
              />
            </FormField>
            <FormField
              label="School"
              name="school"
              wide
              hint="Coaches use this for school-pickup programs."
            >
              <SchoolSelect name="school" defaultValue={child.school} />
            </FormField>
          </FormPanel>

          <FormPanel className="sm:grid-cols-1">
            <div className="sm:col-span-2 space-y-1">
              <h3 className="text-sm font-medium text-[var(--foreground)]">
                Emergency contact
              </h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                Who should we call if something happens during a lesson?
                Leave blank to default to you and the other parents.
              </p>
            </div>
            <FormField label="Name" name="emergencyContactName">
              <Input
                id="emergencyContactName"
                name="emergencyContactName"
                defaultValue={child.emergencyContactName ?? ""}
              />
            </FormField>
            <FormField label="Phone" name="emergencyContactPhone">
              <Input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                type="tel"
                defaultValue={child.emergencyContactPhone ?? ""}
              />
            </FormField>
            <FormField
              label="Relationship"
              name="emergencyContactRelationship"
              wide
            >
              <Input
                id="emergencyContactRelationship"
                name="emergencyContactRelationship"
                placeholder="Mother / father / aunt …"
                defaultValue={child.emergencyContactRelationship ?? ""}
              />
            </FormField>
          </FormPanel>

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

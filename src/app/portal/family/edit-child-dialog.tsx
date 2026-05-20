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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SchoolSelect } from "@/app/admin/people/[id]/school-select";
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={child.firstName}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={child.lastName}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <DateField
                id="dateOfBirth"
                name="dateOfBirth"
                defaultValue={child.dateOfBirthIso ?? ""}
                mode="dob"
                locale="en-NL"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>School</Label>
              <SchoolSelect name="school" defaultValue={child.school} />
              <p className="text-xs text-[var(--muted-foreground)]">
                Coaches use this for school-pickup programs.
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Emergency contact
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Who should we call if something happens during a lesson? Leave
              blank to default to you and the other parents.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactName">Name</Label>
                <Input
                  id="emergencyContactName"
                  name="emergencyContactName"
                  defaultValue={child.emergencyContactName ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactPhone">Phone</Label>
                <Input
                  id="emergencyContactPhone"
                  name="emergencyContactPhone"
                  type="tel"
                  defaultValue={child.emergencyContactPhone ?? ""}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="emergencyContactRelationship">
                  Relationship
                </Label>
                <Input
                  id="emergencyContactRelationship"
                  name="emergencyContactRelationship"
                  placeholder="Mother / father / aunt …"
                  defaultValue={child.emergencyContactRelationship ?? ""}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

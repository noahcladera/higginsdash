"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SchoolSelect } from "@/app/admin/people/[id]/school-select";
import { PlusIcon } from "@/components/icons";
import { useActionFeedback } from "@/lib/feedback";
import { addChildToHousehold } from "./actions";

/**
 * "Add a child" dialog launched from the Family page header. Mirrors the
 * shape of EditChildDialog but creates rather than updates. Lastname can
 * be left blank — the server falls back to the parent's surname.
 */
export function AddChildDialog({
  trigger,
  parentLastName,
  defaultOpen = false,
}: {
  /** Optional custom trigger; defaults to a primary button. */
  trigger?: React.ReactNode;
  parentLastName?: string;
  /** When true (e.g. `/portal/family?addChild=1`), open the dialog on load. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const { run, pending, error, clearError } = useActionFeedback({
    success: "Child added",
    successDescription: "They'll show up in your family list now.",
    onSuccess: () => setOpen(false),
  });

  function onSubmit(formData: FormData) {
    run(() => addChildToHousehold(formData));
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
        {trigger ?? (
          <Button tone="triaz">
            <PlusIcon /> Add a child
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a child</DialogTitle>
          <DialogDescription>
            Just the basics for now — lessons get added later when a coach
            signs them up.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder={parentLastName ?? "Optional"}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <DateField
                id="dateOfBirth"
                name="dateOfBirth"
                mode="dob"
                locale="en-NL"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>School (optional)</Label>
              <SchoolSelect name="school" defaultValue={null} />
              <p className="text-xs text-[var(--muted-foreground)]">
                Used by coaches for school-pickup programs.
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--surface)] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Emergency contact
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Leave blank to default to the other adults in your household.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactName">Name</Label>
                <Input
                  id="emergencyContactName"
                  name="emergencyContactName"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactPhone">Phone</Label>
                <Input
                  id="emergencyContactPhone"
                  name="emergencyContactPhone"
                  type="tel"
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
            <Button type="submit" tone="triaz" disabled={pending}>
              {pending ? "Adding…" : "Add child"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

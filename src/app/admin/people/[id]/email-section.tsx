"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActionFeedback } from "@/lib/feedback";
import {
  addEmail,
  archiveEmail,
  restoreEmail,
  setPrimaryEmail,
} from "../actions";

export type EmailRow = {
  id: string;
  address: string;
  kind: string;
  isPrimary: boolean;
  isVerified: boolean;
  archivedAt: Date | null;
};

export function EmailSection({
  personId,
  emails,
}: {
  personId: string;
  emails: EmailRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        {emails.length === 0 ? (
          <div className="p-4 text-sm text-[var(--muted-foreground)]">
            No email addresses on file.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {emails.map((e) => (
              <EmailRowItem key={e.id} personId={personId} email={e} />
            ))}
          </ul>
        )}
      </div>
      <AddEmailForm personId={personId} />
    </div>
  );
}

function EmailRowItem({
  personId,
  email,
}: {
  personId: string;
  email: EmailRow;
}) {
  const isArchived = email.archivedAt !== null;
  const { run, pending, error } = useActionFeedback({
    errorTitle: "Couldn't update email",
  });

  function call(fn: () => Promise<void>, success: string) {
    run(async () => {
      await fn();
      return { ok: true, message: success };
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${isArchived ? "text-[var(--muted-foreground)] line-through" : ""}`}
          >
            {email.address}
          </span>
          {email.isPrimary && (
            <Badge variant="outline" tone="neutral">
              primary
            </Badge>
          )}
          <Badge variant="outline">{email.kind}</Badge>
          {email.isVerified && (
            <StatusBadge tone="success">verified</StatusBadge>
          )}
          {isArchived && <StatusBadge tone="neutral">archived</StatusBadge>}
        </div>
        {error && (
          <p className="text-xs text-[var(--destructive)]">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isArchived && !email.isPrimary && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              call(
                () => setPrimaryEmail(personId, email.id),
                "Primary email updated",
              )
            }
          >
            Make primary
          </Button>
        )}
        {!isArchived ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              call(() => archiveEmail(personId, email.id), "Email removed")
            }
          >
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              call(() => restoreEmail(personId, email.id), "Email restored")
            }
          >
            Restore
          </Button>
        )}
      </div>
    </li>
  );
}

function AddEmailForm({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error } = useActionFeedback({
    success: "Email added",
    errorTitle: "Couldn't add email",
    onSuccess: () => setOpen(false),
  });

  function onSubmit(formData: FormData) {
    run(async () => {
      await addEmail(personId, formData);
      return { ok: true };
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add email
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--muted)] p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="address">Email address</Label>
          <Input
            id="address"
            name="address"
            type="email"
            required
            placeholder="name@example.com"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select name="kind" defaultValue="personal">
            <SelectTrigger id="kind" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="work">Work</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="isPrimary" name="isPrimary" />
        <Label htmlFor="isPrimary" className="cursor-pointer text-sm">
          Mark as primary
        </Label>
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add email"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

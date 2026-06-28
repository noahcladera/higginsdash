"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonPicker } from "@/components/admin/person-picker";
import { useActionFeedback } from "@/lib/feedback";
import { addMember, removeMember, setPrimaryContact } from "../actions";
import { ContactButton } from "@/components/contacts/contact-button";
import type { PersonContactGroup } from "@/lib/contacts/queries";

export type MemberRow = {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  role: string;
  isPrimaryContact: boolean;
  joinedOn: string;
  contactGroup: PersonContactGroup | null;
};

export function MembersSection({
  householdId,
  members,
  brandName,
}: {
  householdId: string;
  members: MemberRow[];
  brandName: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        {members.length === 0 ? (
          <div className="p-4 text-sm text-[var(--muted-foreground)]">
            No members yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {members.map((m) => (
              <MemberRowItem
                key={m.id}
                householdId={householdId}
                member={m}
                brandName={brandName}
              />
            ))}
          </ul>
        )}
      </div>

      {adding ? (
        <AddMemberForm
          householdId={householdId}
          onDone={() => setAdding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          + Add member
        </Button>
      )}
    </div>
  );
}

function MemberRowItem({
  householdId,
  member,
  brandName,
}: {
  householdId: string;
  member: MemberRow;
  brandName: string;
}) {
  const [lastAction, setLastAction] = useState<"primary" | "remove">("primary");
  const { run: runFeedback, pending, error } = useActionFeedback({
    success: () =>
      lastAction === "primary"
        ? `${member.name} is now the primary contact`
        : `${member.name} removed from household`,
  });

  function run(action: "primary" | "remove", fn: () => Promise<void>) {
    setLastAction(action);
    runFeedback(async () => {
      await fn();
      return { ok: true };
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/people/${member.personId}`}
            className="text-sm font-medium hover:underline"
          >
            {member.name}
          </Link>
          <Badge variant="outline">{member.role}</Badge>
          {member.isPrimaryContact && (
            <Badge variant="default">primary contact</Badge>
          )}
        </div>
        {member.email && (
          <div className="text-xs text-[var(--muted-foreground)]">
            {member.email}
          </div>
        )}
        <div className="text-xs text-[var(--muted-foreground)]">
          Joined {member.joinedOn}
        </div>
        {error && (
          <p className="text-xs text-[var(--destructive)]">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {member.contactGroup && member.contactGroup.targets.length > 0 && (
          <ContactButton
            group={member.contactGroup}
            subjectName={member.name}
            brandName={brandName}
            size="xs"
            hideUnavailable
          />
        )}
        {!member.isPrimaryContact && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("primary", () =>
                setPrimaryContact(householdId, member.personId),
              )
            }
          >
            Make primary
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending || member.isPrimaryContact}
          title={
            member.isPrimaryContact
              ? "Promote a different member to primary first."
              : undefined
          }
          onClick={() => {
            if (!confirm(`Remove ${member.name} from this household?`)) return;
            run("remove", () => removeMember(householdId, member.id));
          }}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

function AddMemberForm({
  householdId,
  onDone,
}: {
  householdId: string;
  onDone: () => void;
}) {
  const { run, pending, error } = useActionFeedback({
    success: "Member added",
    onSuccess: onDone,
  });

  function onSubmit(formData: FormData) {
    run(async () => {
      await addMember(householdId, formData);
      return { ok: true };
    });
  }

  return (
    <form
      action={onSubmit}
      className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--muted)] p-4"
    >
      <div className="space-y-1.5">
        <Label>Person</Label>
        <PersonPicker name="personId" required excludeInHousehold />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="roleInHousehold">Role</Label>
        <Select name="roleInHousehold" defaultValue="adult">
          <SelectTrigger id="roleInHousehold" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="adult">Adult</SelectItem>
            <SelectItem value="child">Child</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {pending ? "Adding…" : "Add member"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

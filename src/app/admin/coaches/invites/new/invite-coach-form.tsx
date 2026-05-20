"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CoachInviteRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCoachInviteForm,
  type CoachInviteActionResult,
} from "../../actions";

const initialState: CoachInviteActionResult = { ok: true };

type Club = { id: string; name: string; slug: string };

export function InviteCoachForm({ clubs }: { clubs: Club[] }) {
  const [state, formAction] = useActionState(
    createCoachInviteForm,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.ok === false && (
        <div className="rounded-md border border-[var(--destructive)] bg-[var(--card)] p-3 text-sm text-[var(--destructive)]">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" required />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Role</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="role"
            value={CoachInviteRole.staff_coach}
            defaultChecked
            className="rounded border-[var(--border)]"
          />
          HTN staff coach
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="role"
            value={CoachInviteRole.zzp_coach}
            className="rounded border-[var(--border)]"
          />
          External (ZZP) coach
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Clubs (optional — staff)</legend>
        <p className="text-xs text-[var(--muted-foreground)]">
          For staff, leave all unchecked = all clubs. For ZZP, select one or
          more.
        </p>
        {clubs.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No clubs in the system yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {clubs.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="clubIds"
                    value={c.id}
                    className="rounded border-[var(--border)]"
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" tone="joint" className="flex-1">
          Send invite email
        </Button>
        <Button asChild type="button" variant="outline" className="flex-1">
          <Link href="/admin/coaches">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

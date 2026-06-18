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
import { CopyableText } from "../../_copyable-text";

type Club = { id: string; name: string; slug: string };

export function InviteCoachForm({ clubs }: { clubs: Club[] }) {
  const [state, formAction] = useActionState<
    CoachInviteActionResult | undefined,
    FormData
  >(createCoachInviteForm, undefined);

  if (state?.ok === true) {
    return (
      <div className="space-y-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <div>
          <h2 className="text-lg font-semibold">Coach ready to sign in</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            The coach role is already assigned for {state.email}. Share the
            credentials below — they will land in the coach portal after sign-in.
            {state.emailed
              ? " A copy was also emailed via Resend."
              : " Email was not sent — set RESEND_API_KEY on the server, or copy the link below and share it manually."}
          </p>
        </div>

        {state.loginMethod === "magiclink" ? (
          <div className="space-y-2">
            <Label>Magic sign-in link</Label>
            <CopyableText value={state.actionLink} label="Copy link" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-[var(--muted-foreground)]">Login page</span>
              <div className="mt-1">
                <CopyableText value={state.loginUrl} label="Copy URL" />
              </div>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Email</span>
              <div className="mt-1 font-medium">{state.email}</div>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">
                Temporary password
              </span>
              <div className="mt-1">
                <CopyableText
                  value={state.temporaryPassword}
                  label="Copy password"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild tone="joint" className="flex-1">
            <Link href="/admin/coaches">Back to coaches</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/coaches/invites/new">Invite another</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.ok === false && (
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sign-in method</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="loginMethod"
            value="magiclink"
            defaultChecked
            className="rounded border-[var(--border)]"
          />
          Magic link (recommended — copyable in admin, no Supabase email quota)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="loginMethod"
            value="password"
            className="rounded border-[var(--border)]"
          />
          Temporary password (sign in at /login)
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
          Create coach & get login
        </Button>
        <Button asChild type="button" variant="outline" className="flex-1">
          <Link href="/admin/coaches">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

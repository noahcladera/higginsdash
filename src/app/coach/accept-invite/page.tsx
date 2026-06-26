import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { acceptCoachInvite } from "./actions";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { markCoachInviteAccepted } from "@/lib/auth/complete-coach-invite";

function buildErrorMessages(
  brandShortName: string,
  coachSingular: string,
): Record<string, string> {
  return {
    missing_token:
      "This link is missing required information. Ask an admin for a new coach login link.",
    invalid_invite: "This invite is not valid or was revoked.",
    expired: "This invite has expired. Ask an admin to send a new one.",
    email_mismatch:
      "You’re signed in with a different email than the invite. Sign out and use the invited address.",
    missing_person:
      "Your profile isn’t ready yet. Try again in a moment or contact the office.",
    not_provisioned:
      "Coach access is not set up yet. Ask an admin to resend your login link from Coaches → Pending invites.",
    has_zzp:
      `Your account already has an independent ${coachSingular.toLowerCase()} profile. Contact the office.`,
    has_staff_coach: `Your account already has a ${brandShortName} staff ${coachSingular.toLowerCase()} profile. Contact the office.`,
  };
}

export default async function CoachAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.trim() : "";
  const errorKey = typeof sp.error === "string" ? sp.error : undefined;
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
  const errorMessages = buildErrorMessages(brand.shortName, terms.coach.singular);
  const coachRole = terms.coach.role;

  if (!token) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-16">
        <PageHeader
          kicker={coachRole}
          title="Invalid invite link"
          description="Ask an admin for a coach login link from the Coaches screen."
        />
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const invite = await prisma.coachInvite.findUnique({
    where: { token },
    include: {
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!invite || invite.revokedAt) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-16">
        <PageHeader
          kicker={coachRole}
          title="Invite not found"
          description="This link is no longer valid."
        />
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (invite.acceptedAt) {
    redirect("/coach");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      await ensurePersonForAuthUser({
        authUserId: user.id,
        email: user.email ?? null,
      });
    } catch (err) {
      console.error("[coach/accept-invite] ensurePersonForAuthUser", err);
    }
  }

  const person =
    user &&
    (await prisma.person.findUnique({
      where: { id: user.id },
      include: { coach: true, zzpCoach: true },
    }));

  const hasCoachAccess =
    person?.coach?.isActive === true || person?.zzpCoach?.isActive === true;

  if (
    user &&
    user.email?.trim().toLowerCase() === invite.email.trim().toLowerCase() &&
    hasCoachAccess &&
    person
  ) {
    await markCoachInviteAccepted({
      inviteId: invite.id,
      personId: person.id,
    });
    redirect("/coach");
  }

  const loginNext = `/coach/accept-invite?token=${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16">
      <PageHeader
        kicker={`${terms.coach.singular} invite`}
        title={`Your ${terms.coach.singular.toLowerCase()} portal access`}
        description={
          invite.invitedBy.firstName || invite.invitedBy.lastName
            ? `Invited by ${[invite.invitedBy.firstName, invite.invitedBy.lastName].filter(Boolean).join(" ")}.`
            : `You’ve been invited to the ${brand.shortName} ${coachRole.toLowerCase()} portal.`
        }
      />

      {errorKey && errorMessages[errorKey] && (
        <div className="rounded-md border border-[var(--destructive)] bg-[var(--card)] p-3 text-sm text-[var(--destructive)]">
          {errorMessages[errorKey]}
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm space-y-2">
        <div>
          <span className="text-[var(--muted-foreground)]">Email</span>
          <div className="font-medium">{invite.email}</div>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Role</span>
          <div className="font-medium">
            {invite.role === "staff_coach"
              ? "HTN staff coach (full access unless clubs were restricted)"
              : "External (ZZP) coach"}
          </div>
        </div>
      </div>

      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            Sign in with the email address above using the magic link or
            password your admin shared. You will land in the coach portal
            automatically.
          </p>
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>
              Sign in
            </Link>
          </Button>
        </div>
      ) : user.email?.trim().toLowerCase() !== invite.email.trim().toLowerCase() ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--destructive)]">
            You’re signed in as {user.email}. This invite is for {invite.email}.
            Sign out and sign in with the invited email.
          </p>
          <Button asChild variant="outline">
            <Link href="/login">Sign out and switch account</Link>
          </Button>
        </div>
      ) : invite.expiresAt < new Date() ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          This invite expired. Ask an admin for a new login link.
        </p>
      ) : hasCoachAccess ? (
        <form action={acceptCoachInvite} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-[var(--muted-foreground)]">
            Your coach access is already active. Continue to the coach portal.
          </p>
          <Button type="submit" className="w-full">
            Go to coach portal
          </Button>
        </form>
      ) : (
        <form action={acceptCoachInvite} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-[var(--muted-foreground)]">
            Confirm to finish setup on this older invite link.
          </p>
          <Button type="submit" className="w-full">
            Continue to coach portal
          </Button>
        </form>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { acceptCoachInvite } from "./actions";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

function buildErrorMessages(
  brandShortName: string,
  coachSingular: string,
): Record<string, string> {
  return {
    missing_token:
      "This link is missing required information. Open the link from your invite email.",
    invalid_invite: "This invite is not valid or was revoked.",
    expired: "This invite has expired. Ask an admin to send a new one.",
    email_mismatch:
      "You’re signed in with a different email than the invite. Sign out and use the invited address.",
    missing_person:
      "Your profile isn’t ready yet. Try again in a moment or contact the office.",
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
          description="Open the link from your invite email, or ask an admin to resend it."
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

  const loginNext = `/coach/accept-invite?token=${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16">
      <PageHeader
        kicker={`${terms.coach.singular} invite`}
        title={`Finish setting up your ${terms.coach.singular.toLowerCase()} account`}
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
            Sign in with the email address that received the invite. After you
            sign in, return here if you’re not redirected automatically.
          </p>
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>
              Sign in to continue
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
          This invite expired. Ask an admin for a new invite.
        </p>
      ) : (
        <form action={acceptCoachInvite} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" className="w-full">
            Activate coach portal access
          </Button>
        </form>
      )}
    </div>
  );
}

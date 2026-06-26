import Link from "next/link";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, FamilyIcon, PlusIcon } from "@/components/icons";
import { ProfileForm } from "@/components/account/profile-form";
import { ImageUpload } from "@/components/ui/image-upload";
import { Avatar } from "@/components/portal/avatar";
import { updateMyProfilePortal } from "@/lib/account/profile-actions";

/**
 * Self-serve profile editor. Email is intentionally not editable —
 * Supabase Auth owns it and changing it would mean confirming a new
 * address, which is out of scope for v1.
 *
 * Beneath the form we surface a small "Family" entry-point panel: solo
 * adults can open up the family side of their account here (the sidebar
 * "My family" item only auto-appears once they have a kid or a family-
 * tier membership — see {@link getPortalNavSections}).
 */
export default async function PortalProfilePage() {
  const { person, householdId } = await requireMember();

  const full = await prisma.person.findUniqueOrThrow({
    where: { id: person.id },
    include: {
      emails: { where: { isPrimary: true }, take: 1 },
    },
  });

  const primaryEmail = full.emails[0]?.address ?? null;

  // Mirrors the rule in `getPortalNavSections` so the panel and the
  // sidebar stay in sync — has-family state = at least one child OR an
  // active family-tier membership on the household.
  const [childCount, familyMembershipCount] = householdId
    ? await Promise.all([
        prisma.householdMember.count({
          where: { householdId, roleInHousehold: "child" },
        }),
        prisma.membership.count({
          where: {
            householdId,
            status: "active",
            coverageTier: "family",
          },
        }),
      ])
    : [0, 0];

  const hasFamily = childCount > 0 || familyMembershipCount > 0;
  const canOpenFamily = householdId != null;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Profile"
        title="Your details"
        description="Keep contact info current so the office can reach you."
      />

      {primaryEmail && (
        <div className="elev-panel px-5 py-4 text-sm">
          <span className="text-sm font-medium text-[var(--foreground)]/80">
            Sign-in email
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-medium">{primaryEmail}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              Managed via your sign-in — contact the office to change it.
            </span>
          </div>
        </div>
      )}

      <section className="elev-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            name={`${full.firstName} ${full.lastName}`}
            src={full.avatarUrl}
            size="xl"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Profile photo
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Optional — shown on your household ribbon and family page.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <ProfileForm
            initial={{
              firstName: full.firstName,
              lastName: full.lastName,
              phone: full.phone ?? "",
              dateOfBirthIso: full.dateOfBirth
                ? full.dateOfBirth.toISOString().slice(0, 10)
                : "",
              gender: full.gender ?? "",
              addressLine1: full.addressLine1 ?? "",
              addressLine2: full.addressLine2 ?? "",
              postalCode: full.postalCode ?? "",
              city: full.city ?? "",
              country: full.country,
              emergencyContactName: full.emergencyContactName ?? "",
              emergencyContactPhone: full.emergencyContactPhone ?? "",
              emergencyContactRelationship:
                full.emergencyContactRelationship ?? "",
              avatarUrl: full.avatarUrl ?? "",
            }}
            action={updateMyProfilePortal}
            avatarUploadSlot={
              <ImageUpload
                name="avatarUrl"
                defaultUrl={full.avatarUrl}
                kind="photo"
                aspect="square"
                label="Upload photo"
                showStockPicker={false}
                helpText="Square photos work best. PNG, JPG, or WebP up to 8MB."
              />
            }
          />
        </div>
      </section>

      {canOpenFamily && <FamilyEntryPanel hasFamily={hasFamily} />}
    </div>
  );
}

/**
 * Small panel surfaced under the profile form. Renders one of two
 * states depending on whether the household has any kids / a family-tier
 * membership today.
 */
function FamilyEntryPanel({ hasFamily }: { hasFamily: boolean }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-[var(--surface)] px-5 py-4">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted-foreground)]"
        >
          <FamilyIcon size={16} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-medium tracking-tight">
              {hasFamily
                ? "Your family"
                : "Set up a family on this account"}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {hasFamily
                ? "Manage who's on your account here."
                : "Add your kids so coaches always have their info, or buy a family membership when you're ready."}
            </p>
          </div>

          {hasFamily ? (
            <Button asChild tone="triaz" size="sm">
              <Link href="/portal/family">
                Manage your family <ArrowRightIcon size={14} />
              </Link>
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button asChild tone="triaz" size="sm">
                <Link href="/portal/family">
                  <PlusIcon size={14} /> Add a child
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/portal/membership">See family memberships</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

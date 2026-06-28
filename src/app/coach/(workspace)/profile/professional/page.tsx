import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import {
  CoachProfessionalStaffForm,
  CoachProfessionalZzpForm,
} from "@/components/account/coach-professional-form";
import {
  updateStaffCoachProfessional,
  updateZzpCoachProfessional,
} from "@/lib/account/coach-actions";

export default async function CoachProfessionalPage() {
  const { person } = await requireCoach();

  const full = await prisma.person.findUniqueOrThrow({
    where: { id: person.id },
    include: {
      coach: true,
      zzpCoach: true,
      coachClubAccess: {
        include: { club: { select: { name: true } } },
      },
    },
  });

  const clubLabels =
    full.coachClubAccess.length === 0
      ? []
      : full.coachClubAccess.map((a) => a.club.name);

  if (full.coach?.isActive && full.coach) {
    const coach = full.coach;
    return (
      <div className="space-y-10">
        <ShellPageHeader
          kicker="Account"
          title="Professional profile"
          description="Bio and photo for listings; rates and qualifications are admin-managed."
        />
        <CoachProfessionalStaffForm
          initial={{
            bio: coach.bio ?? "",
            photoUrl: coach.photoUrl ?? "",
          }}
          readOnly={{
            knltbQualification: coach.knltbQualification,
            employmentType: coach.employmentType,
            defaultHourlyRate:
              coach.defaultHourlyRate != null
                ? `€ ${Number(coach.defaultHourlyRate).toFixed(2)}`
                : null,
            clubLabels,
          }}
          action={updateStaffCoachProfessional}
        />
      </div>
    );
  }

  if (full.zzpCoach?.isActive && full.zzpCoach) {
    const z = full.zzpCoach;
    return (
      <div className="space-y-10">
        <ShellPageHeader
          kicker="Account"
          title="Professional profile"
          description="Your business details as an independent coach."
        />
        <CoachProfessionalZzpForm
          initial={{
            businessName: z.businessName ?? "",
            vatNumber: z.vatNumber ?? "",
          }}
          readOnly={{
            defaultCourtRentalRate:
              z.defaultCourtRentalRate != null
                ? `€ ${Number(z.defaultCourtRentalRate).toFixed(2)}`
                : null,
            contractStartIso: z.contractStart?.toISOString() ?? null,
            contractEndIso: z.contractEnd?.toISOString() ?? null,
            clubLabels,
          }}
          action={updateZzpCoachProfessional}
        />
      </div>
    );
  }

  return notFound();
}

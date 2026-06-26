import { prisma } from "../src/lib/prisma";

async function main() {
  const emails = [
    "adult.example@higginstennisnl.test",
    "parent.multi.example@higginstennisnl.test",
    "parent.single.example@higginstennisnl.test",
  ];
  for (const email of emails) {
    const p = await prisma.person.findFirst({
      where: { emails: { some: { address: email } } },
      include: { householdMember: true, student: true },
    });
    if (!p) {
      console.log(email, "NOT FOUND");
      continue;
    }
    const hh = p.householdMember?.householdId;
    const mems = hh
      ? await prisma.membership.findMany({
          where: { householdId: hh },
          select: { status: true, coverageTier: true, expiresOn: true },
        })
      : [];
    const childCount = hh
      ? await prisma.householdMember.count({
          where: { householdId: hh, roleInHousehold: "child" },
        })
      : 0;
    console.log(
      JSON.stringify({
        email,
        name: p.firstName,
        isStudent: !!p.student,
        householdId: hh,
        childCount,
        memberships: mems,
      }),
    );
  }
}

main()
  .finally(() => prisma.$disconnect());

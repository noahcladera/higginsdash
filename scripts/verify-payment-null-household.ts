/**
 * Smoke test: Prisma can create a Payment with paidByHouseholdId = null
 * (coach invoices). Rolls back by deleting the row. Run:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/verify-payment-null-household.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    const coach = await tx.person.findFirst({
      where: { firstName: "Carlos", lastName: "Mendez" },
      select: { id: true },
    });
    if (!coach) {
      console.log("SKIP: No Carlos Mendez in DB — seed examples if needed.");
      return;
    }
    const p = await tx.payment.create({
      data: {
        amount: new Prisma.Decimal("0.01"),
        currency: "EUR",
        status: "pending",
        description: "verify paidByHouseholdId null (smoke test)",
        paidByPersonId: coach.id,
        paidByHouseholdId: null,
        invoiceNumber: `VERIFY-${Date.now()}`,
        issuedAt: new Date(),
      },
    });
    await tx.payment.delete({ where: { id: p.id } });
    console.log(
      "OK: create+delete with paidByHouseholdId=null (engine accepts nullable FK)",
    );
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

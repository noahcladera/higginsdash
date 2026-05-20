import { statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// Singleton — survives HMR in dev so we don't open a new Postgres connection
// on every reload. After `prisma generate` / `db:migrate`, the generated client
// on disk changes; drop the cached instance so the next import picks it up
// (still restart `npm run dev` if queries reference removed columns).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClientMtimeMs?: string;
};

function generatedClientMtimeMs(): string {
  try {
    const clientEntry = join(
      process.cwd(),
      "node_modules",
      ".prisma",
      "client",
      "index.js",
    );
    return String(statSync(clientEntry).mtimeMs);
  } catch {
    return "0";
  }
}

const clientMtime = generatedClientMtimeMs();
if (
  globalForPrisma.prisma &&
  globalForPrisma.prismaClientMtimeMs !== clientMtime
) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}
globalForPrisma.prismaClientMtimeMs = clientMtime;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

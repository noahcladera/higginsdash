/**
 * NL coach registry — names and emails from calendar ATTENDEE fields +
 * brain/data/master/portal/people.csv.
 *
 * Display-only coaches (no Supabase auth). Deterministic uuidv5 ids.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";

const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export type CoachRegistryEntry = {
  key: string;
  firstName: string;
  lastName: string;
  email: string | null;
  knltbQualification: string;
  defaultHourlyRate: string;
  bio: string;
  /** Aliases matched in calendar titles (lowercase). */
  aliases: string[];
};

export const COACH_REGISTRY: CoachRegistryEntry[] = [
  {
    key: "farah",
    firstName: "Farah",
    lastName: "Fernandez",
    email: "farahfernandez27@gmail.com",
    knltbQualification: "A",
    defaultHourlyRate: "95.00",
    bio: "Senior coach — adult performance and competitive juniors.",
    aliases: ["farah", "mfarah", "tfarah"],
  },
  {
    key: "ramzi",
    firstName: "Ramzi",
    lastName: "Chouikha",
    email: "ramzi.c@gmail.com",
    knltbQualification: "B",
    defaultHourlyRate: "75.00",
    bio: "All-court coach — serve mechanics and baseline play.",
    aliases: ["ramzi", "mramzi", "tramzi", "tramz"],
  },
  {
    key: "ivan",
    firstName: "Ivan",
    lastName: "Figueroa",
    email: "fullrock1989@gmail.com",
    knltbQualification: "B",
    defaultHourlyRate: "80.00",
    bio: "Tactics-first coach — intermediate adults and teens.",
    aliases: ["ivan"],
  },
  {
    key: "enric",
    firstName: "Enric",
    lastName: "Noguera",
    email: "noguera.enric@gmail.com",
    knltbQualification: "B",
    defaultHourlyRate: "75.00",
    bio: "Beginner-friendly adult group coach.",
    aliases: ["enric"],
  },
  {
    key: "set",
    firstName: "Set",
    lastName: "Strand",
    email: "set.strand@gmail.com",
    knltbQualification: "C",
    defaultHourlyRate: "70.00",
    bio: "Club coach — adult social play and recreational improvers.",
    aliases: ["set"],
  },
  {
    key: "noah",
    firstName: "Noah",
    lastName: "Cladera",
    email: "noahcladera@gmail.com",
    knltbQualification: "A",
    defaultHourlyRate: "100.00",
    bio: "Head coach — staff oversight and competitive programme.",
    aliases: ["noah"],
  },
  {
    key: "harvey",
    firstName: "Harvey",
    lastName: "Osu",
    email: "harveyosu@gmail.com",
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Youth and adult group coach.",
    aliases: ["harvey"],
  },
  {
    key: "sofia",
    firstName: "Sofia",
    lastName: "Giustizieri",
    email: "sofiagiustizieri67@gmail.com",
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Youth development coach.",
    aliases: ["sofia"],
  },
  {
    key: "giorgio",
    firstName: "Giorgio",
    lastName: "Crisci",
    email: "crisci.giorgio@yahoo.it",
    knltbQualification: "A",
    defaultHourlyRate: "90.00",
    bio: "Performance coach — junior development pathways.",
    aliases: ["giorgio"],
  },
  {
    key: "jouvence",
    firstName: "Jouvence",
    lastName: "Monteiro",
    email: "jouvence-monteiro@edu.em-lyon.com",
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Youth mini-tennis coach.",
    aliases: ["jouvence"],
  },
  {
    key: "artem",
    firstName: "Artem",
    lastName: "Ivchenko",
    email: "artemivchenko8884@gmail.com",
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Adult and youth group coach.",
    aliases: ["artem"],
  },
  {
    key: "olha",
    firstName: "Olha",
    lastName: "Kovalenko",
    email: null,
    knltbQualification: "B",
    defaultHourlyRate: "80.00",
    bio: "Technical coach.",
    aliases: ["olha"],
  },
  {
    key: "banu",
    firstName: "Banu",
    lastName: "Coach",
    email: null,
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Youth group coach.",
    aliases: ["banu"],
  },
  {
    key: "melissa",
    firstName: "Melissa",
    lastName: "de Vries",
    email: "melissawilliamsdesign@gmail.com",
    knltbQualification: "A",
    defaultHourlyRate: "95.00",
    bio: "Long-time staff coach — women's clinic programme.",
    aliases: ["melissa"],
  },
  {
    key: "william",
    firstName: "William",
    lastName: "Higgins",
    email: "higginstennisnloffice@gmail.com",
    knltbQualification: "A",
    defaultHourlyRate: "90.00",
    bio: "Director — occasional adult and youth sessions.",
    aliases: ["william", "whiggins"],
  },
];

const ALIAS_TO_KEY = new Map<string, string>();
for (const c of COACH_REGISTRY) {
  for (const a of c.aliases) {
    ALIAS_TO_KEY.set(a.toLowerCase(), c.key);
  }
}

export function coachPersonId(key: string): string {
  return uuidv5(`coach-seed:${key}`, NS);
}

export function resolveCoachKeysFromTitle(title: string): string[] {
  const lower = title.toLowerCase();
  const found = new Set<string>();

  for (const entry of COACH_REGISTRY) {
    for (const alias of entry.aliases) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) found.add(entry.key);
    }
  }

  // M-prefix patterns like MFarah, MRamzi
  for (const m of lower.matchAll(/\bm(farah|ramzi|william)\b/gi)) {
    const k = ALIAS_TO_KEY.get(m[1].toLowerCase());
    if (k) found.add(k);
  }

  return [...found];
}

export function resolveCoachKeyFromEmail(email: string): string | null {
  const norm = email.toLowerCase().trim();
  for (const c of COACH_REGISTRY) {
    if (c.email?.toLowerCase() === norm) return c.key;
  }
  if (norm === "fullrock1989@gmail.com") return "ivan";
  return null;
}

function photoUrlFor(entry: CoachRegistryEntry): string {
  const seed = encodeURIComponent(`${entry.firstName} ${entry.lastName}`);
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
}

export async function upsertCoachRegistry(prisma: PrismaClient): Promise<Map<string, string>> {
  const keyToPersonId = new Map<string, string>();

  for (const entry of COACH_REGISTRY) {
    const personId = coachPersonId(entry.key);
    keyToPersonId.set(entry.key, personId);

    await prisma.person.upsert({
      where: { id: personId },
      create: {
        id: personId,
        firstName: entry.firstName,
        lastName: entry.lastName,
        country: "NL",
        notes: "Seeded NL coach from calendar registry.",
      },
      update: {
        firstName: entry.firstName,
        lastName: entry.lastName,
      },
    });

    if (entry.email) {
      const existing = await prisma.emailAddress.findUnique({
        where: { address: entry.email },
      });
      if (!existing) {
        await prisma.emailAddress.create({
          data: {
            personId,
            address: entry.email,
            kind: "personal",
            isPrimary: true,
            isVerified: true,
            verifiedAt: new Date(),
          },
        });
      } else if (existing.personId !== personId) {
        await prisma.emailAddress.update({
          where: { address: entry.email },
          data: { personId },
        });
      }
    }

    const rate = new Prisma.Decimal(entry.defaultHourlyRate);
    await prisma.coach.upsert({
      where: { personId },
      create: {
        personId,
        employmentType: "employee",
        defaultHourlyRate: rate,
        knltbQualification: entry.knltbQualification,
        bio: entry.bio,
        photoUrl: photoUrlFor(entry),
        isActive: true,
        joinedOn: new Date("2022-01-01"),
      },
      update: {
        employmentType: "employee",
        defaultHourlyRate: rate,
        knltbQualification: entry.knltbQualification,
        bio: entry.bio,
        photoUrl: photoUrlFor(entry),
        isActive: true,
      },
    });
  }

  return keyToPersonId;
}

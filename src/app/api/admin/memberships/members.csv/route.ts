import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/tenant";

/**
 * GET /api/admin/memberships/members.csv?club=triaz
 *
 * Streams a CSV of every person currently covered by an active
 * membership at the requested club. Mirrors the bucketing logic in
 * `/admin/memberships/members/page.tsx` so what an admin sees on
 * screen and what they download stay in sync.
 *
 * Query params:
 *   club   "triaz" | "randwijck" | "all" (default: "all")
 *
 * Output columns (UTF-8, comma-separated, RFC 4180 quoting):
 *   club, last_name, first_name, age, email, phone, household, tier,
 *   membership_starts_on, membership_expires_on
 *
 * Why not Excel: Heather asked for a one-click export she can paste
 * into Moneybird and KNLTB tooling — both of which accept CSV. We can
 * graduate to XLSX later via the same query if needed.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const org = await getCurrentOrg();
  const url = new URL(req.url);
  const clubParam = (url.searchParams.get("club") ?? "all").toLowerCase();

  const slugs: ("triaz" | "randwijck")[] =
    clubParam === "triaz"
      ? ["triaz"]
      : clubParam === "randwijck"
        ? ["randwijck"]
        : ["triaz", "randwijck"];

  const now = new Date();
  const memberships = await prisma.membership.findMany({
    where: {
      status: "active",
      startsOn: { lte: now },
      expiresOn: { gte: now },
      membershipClubs: {
        some: { club: { slug: { in: slugs } } },
      },
    },
    select: {
      id: true,
      coverageTier: true,
      startsOn: true,
      expiresOn: true,
      membershipClubs: { select: { club: { select: { slug: true } } } },
      household: {
        select: {
          id: true,
          displayName: true,
          members: {
            select: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                  phone: true,
                  emails: {
                    where: { archivedAt: null },
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                    take: 1,
                    select: { address: true },
                  },
                },
              },
            },
          },
        },
      },
      assignedPerson: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          emails: {
            where: { archivedAt: null },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { address: true },
          },
          householdMember: {
            select: {
              household: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ expiresOn: "asc" }],
  });

  // Bucket by (club, person) so a person on a joint membership shows
  // up once per club row, not once per membership. Same dedupe rule
  // the on-screen Members table uses.
  type Row = {
    clubSlug: "triaz" | "randwijck";
    firstName: string;
    lastName: string;
    age: number | null;
    email: string | null;
    phone: string | null;
    householdName: string | null;
    tier: string;
    startsOn: Date;
    expiresOn: Date;
  };
  const seen = new Set<string>();
  const rows: Row[] = [];

  function pushRow(
    clubSlug: "triaz" | "randwijck",
    p: {
      id: string;
      firstName: string;
      lastName: string;
      dateOfBirth: Date | null;
      phone: string | null;
      emails: { address: string }[];
    },
    householdName: string | null,
    tier: string,
    startsOn: Date,
    expiresOn: Date,
  ) {
    const key = `${clubSlug}:${p.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      clubSlug,
      firstName: p.firstName,
      lastName: p.lastName,
      age: ageFromDob(p.dateOfBirth),
      email: p.emails[0]?.address ?? null,
      phone: p.phone,
      householdName,
      tier,
      startsOn,
      expiresOn,
    });
  }

  for (const m of memberships) {
    const memberSlugs = m.membershipClubs
      .map((mc) => mc.club.slug.toLowerCase())
      .filter((s): s is "triaz" | "randwijck" =>
        s === "triaz" || s === "randwijck",
      )
      .filter((s) => slugs.includes(s));

    if (memberSlugs.length === 0) continue;

    if (m.coverageTier === "family") {
      for (const hm of m.household.members) {
        for (const slug of memberSlugs) {
          pushRow(
            slug,
            hm.person,
            m.household.displayName,
            m.coverageTier,
            m.startsOn,
            m.expiresOn,
          );
        }
      }
      continue;
    }
    if (m.assignedPerson) {
      const hh = m.assignedPerson.householdMember?.household ?? null;
      for (const slug of memberSlugs) {
        pushRow(
          slug,
          m.assignedPerson,
          hh?.displayName ?? null,
          m.coverageTier,
          m.startsOn,
          m.expiresOn,
        );
      }
    }
  }

  rows.sort((a, b) => {
    const c = a.clubSlug.localeCompare(b.clubSlug);
    if (c !== 0) return c;
    const l = a.lastName.localeCompare(b.lastName);
    if (l !== 0) return l;
    return a.firstName.localeCompare(b.firstName);
  });

  const header = [
    "club",
    "last_name",
    "first_name",
    "age",
    "email",
    "phone",
    "household",
    "tier",
    "membership_starts_on",
    "membership_expires_on",
  ];

  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.clubSlug,
        r.lastName,
        r.firstName,
        r.age?.toString() ?? "",
        r.email ?? "",
        r.phone ?? "",
        r.householdName ?? "",
        r.tier,
        dateFmt(r.startsOn),
        dateFmt(r.expiresOn),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // Prepend a UTF-8 BOM so Excel auto-detects the encoding when an
  // admin double-clicks the file.
  const body = "\uFEFF" + lines.join("\r\n") + "\r\n";

  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-members-${clubParam}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvEscape(value: string): string {
  if (value === "") return "";
  // RFC 4180: quote when value contains comma, quote, or newline; double
  // up internal quotes.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

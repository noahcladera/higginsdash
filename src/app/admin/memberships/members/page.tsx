import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTerms } from "@/lib/tenant";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MembershipCoverageTier } from "@prisma/client";

type ClubSlug = "triaz" | "randwijck";

type MemberRow = {
  personId: string;
  firstName: string;
  lastName: string;
  age: number | null;
  email: string | null;
  householdId: string | null;
  householdName: string | null;
  tier: MembershipCoverageTier;
};

export default async function MembersPage() {
  await requireAdmin();
  const t = await getTerms();
  const now = new Date();

  const memberships = await prisma.membership.findMany({
    where: {
      status: "active",
      startsOn: { lte: now },
      expiresOn: { gte: now },
      membershipClubs: {
        some: { club: { slug: { in: ["triaz", "randwijck"] } } },
      },
    },
    select: {
      id: true,
      coverageTier: true,
      assignedPersonId: true,
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
      membershipClubs: {
        select: { club: { select: { slug: true } } },
      },
    },
  });

  const buckets: Record<ClubSlug, Map<string, MemberRow>> = {
    triaz: new Map(),
    randwijck: new Map(),
  };

  for (const m of memberships) {
    const slugs = m.membershipClubs
      .map((mc) => mc.club.slug.toLowerCase())
      .filter((s): s is ClubSlug => s === "triaz" || s === "randwijck");
    if (slugs.length === 0) continue;

    if (m.coverageTier === "family") {
      for (const hm of m.household.members) {
        const p = hm.person;
        const row: MemberRow = {
          personId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          age: ageFromDob(p.dateOfBirth),
          email: p.emails[0]?.address ?? null,
          householdId: m.household.id,
          householdName: m.household.displayName,
          tier: m.coverageTier,
        };
        for (const slug of slugs) {
          if (!buckets[slug].has(p.id)) buckets[slug].set(p.id, row);
        }
      }
      continue;
    }

    if (m.assignedPerson) {
      const p = m.assignedPerson;
      const hh = p.householdMember?.household ?? null;
      const row: MemberRow = {
        personId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        age: ageFromDob(p.dateOfBirth),
        email: p.emails[0]?.address ?? null,
        householdId: hh?.id ?? null,
        householdName: hh?.displayName ?? null,
        tier: m.coverageTier,
      };
      for (const slug of slugs) {
        if (!buckets[slug].has(p.id)) buckets[slug].set(p.id, row);
      }
    }
  }

  const randwijck = sortRows(Array.from(buckets.randwijck.values()));
  const triaz = sortRows(Array.from(buckets.triaz.values()));

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[{ label: "Memberships", href: "/admin" }, { label: "Members" }]}
      />
      <PageHeader
        kicker={`Admin · ${t.membership.plural}`}
        title={t.member.plural}
        description={`Everyone currently covered by an active ${t.membership.singular.toLowerCase()}, split by ${t.club.singular.toLowerCase()}.`}
        actions={
          <Button asChild variant="outline" tone="neutral" size="sm">
            <a
              href="/api/admin/memberships/members.csv?club=all"
              download
            >
              Download all (CSV)
            </a>
          </Button>
        }
      />

      <ClubSection
        clubName="Randwijck"
        tone="randwijck"
        slug="randwijck"
        rows={randwijck}
      />

      <ClubSection
        clubName="Triaz"
        tone="triaz"
        slug="triaz"
        rows={triaz}
      />
    </div>
  );
}

function ClubSection({
  clubName,
  tone,
  slug,
  rows,
}: {
  clubName: string;
  tone: "triaz" | "randwijck";
  slug: "triaz" | "randwijck";
  rows: MemberRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {clubName}
          </h2>
          <Badge tone={tone} variant="soft">
            {rows.length} {rows.length === 1 ? "member" : "members"}
          </Badge>
        </div>
        {rows.length > 0 && (
          <a
            href={`/api/admin/memberships/members.csv?club=${slug}`}
            download
            className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
          >
            Download {clubName} (CSV)
          </a>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Household</TableHead>
              <TableHead>Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                >
                  No active members at {clubName}.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const fullName =
                  [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
                  "(no name)";
                return (
                  <TableRow key={r.personId}>
                    <TableCell>
                      <Link
                        href={`/admin/people/${r.personId}`}
                        className="font-medium hover:underline"
                      >
                        {fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.age ?? (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted-foreground)]">
                      {r.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.householdId && r.householdName ? (
                        <Link
                          href={`/admin/households/${r.householdId}`}
                          className="hover:underline"
                        >
                          {r.householdName}
                        </Link>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.tier}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function sortRows(rows: MemberRow[]): MemberRow[] {
  return rows.sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName);
    if (ln !== 0) return ln;
    return a.firstName.localeCompare(b.firstName);
  });
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusSurface } from "@/components/ui/status-surface";
import { ChevronRightIcon } from "@/components/icons";
import {
  PersonAvatarWell,
  personAvatarTone,
} from "@/components/admin/person-avatar-well";
import { AdminPaginationFooter } from "@/components/admin/admin-pagination-footer";
import { ContactButton } from "@/components/contacts/contact-button";
import type { PersonContactGroup } from "@/lib/contacts/queries";
import { cn } from "@/lib/utils";

export type PeopleDirectoryRow = {
  id: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  archivedAt: Date | null;
  primaryEmail: string | null;
  household: { id: string; displayName: string } | null;
  isCoach: boolean;
  isStudent: boolean;
};

export type PeopleDirectoryStats = {
  total: number;
  admins: number;
  coaches: number;
  students: number;
  archived: number;
};

export function PeopleDirectory({
  rows,
  stats,
  showArchived,
  query,
  page,
  pageSize,
  searchParams,
  brandName,
  contactsByPersonId,
}: {
  rows: PeopleDirectoryRow[];
  stats: PeopleDirectoryStats;
  showArchived: boolean;
  query: string;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  brandName: string;
  contactsByPersonId: Map<string, PersonContactGroup>;
}) {
  return (
    <div className="space-y-6">
      <MetricStrip>
        <Stat
          label={showArchived ? "Archived" : "Active people"}
          value={stats.total}
          hint={query ? `Matching "${query}"` : "In directory"}
          tone="triaz"
        />
        <Stat label="Admins" value={stats.admins} />
        <Stat label="Coaches" value={stats.coaches} tone="joint" />
        <Stat label="Students" value={stats.students} tone="triaz" />
      </MetricStrip>

      {rows.length === 0 ? (
        <EmptyState
          title={
            query
              ? "No matches"
              : showArchived
                ? "No archived people"
                : "No people yet"
          }
          description={
            query
              ? `Nothing matches "${query}". Try a different name or email.`
              : showArchived
                ? "Archived profiles will appear here."
                : "Add someone with + New person."
          }
        />
      ) : (
        <Section
          title={showArchived ? "Archived" : "Directory"}
          surface={showArchived ? "card" : "bare"}
          padding={showArchived ? "compact" : "none"}
        >
          <ul className="space-y-2">
            {rows.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                brandName={brandName}
                contacts={contactsByPersonId.get(person.id)}
                archived={!!person.archivedAt}
              />
            ))}
          </ul>
        </Section>
      )}

      <AdminPaginationFooter
        page={page}
        pageSize={pageSize}
        total={stats.total}
        searchParams={searchParams}
      />
    </div>
  );
}

function PersonRow({
  person,
  brandName,
  contacts,
  archived = false,
}: {
  person: PeopleDirectoryRow;
  brandName: string;
  contacts?: PersonContactGroup;
  archived?: boolean;
}) {
  const fullName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    "(no name)";
  const tone = personAvatarTone({
    isAdmin: person.isAdmin,
    isCoach: person.isCoach,
    isStudent: person.isStudent,
  });

  return (
    <li>
      <StatusSurface
        tone={tone}
        className={cn(
          "elev-card overflow-hidden p-0 transition-[transform,box-shadow] duration-[var(--duration-fast)] hover:-translate-y-px hover:shadow-[var(--shadow-elevated)]",
          archived && "opacity-70 saturate-[0.92]",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:py-4">
          <PersonAvatarWell
            firstName={person.firstName}
            lastName={person.lastName}
            tone={tone}
            className="hidden sm:flex"
          />

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/people/${person.id}`}
                className="font-medium tracking-tight text-[var(--foreground)] hover:underline"
              >
                {fullName}
              </Link>
              <RoleBadges person={person} />
              {archived && (
                <Badge tone="neutral" variant="soft">
                  archived
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-[var(--muted-foreground)]">
              {person.primaryEmail ?? "—"}
            </p>
            {person.household && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Household:{" "}
                <Link
                  href={`/admin/households/${person.household.id}`}
                  className="text-[var(--foreground)] hover:underline"
                >
                  {person.household.displayName}
                </Link>
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {contacts && (
              <ContactButton
                group={contacts}
                subjectName={fullName}
                brandName={brandName}
                size="xs"
                className="justify-end"
              />
            )}
            <Link
              href={`/admin/people/${person.id}`}
              className="flex items-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              aria-label={`View ${fullName}`}
            >
              <ChevronRightIcon size={16} />
            </Link>
          </div>
        </div>
      </StatusSurface>
    </li>
  );
}

function RoleBadges({ person }: { person: PeopleDirectoryRow }) {
  return (
    <>
      {person.isAdmin && <Badge variant="default">admin</Badge>}
      {person.isCoach && (
        <Badge variant="soft" tone="joint">
          coach
        </Badge>
      )}
      {person.isStudent && <Badge variant="outline">student</Badge>}
    </>
  );
}

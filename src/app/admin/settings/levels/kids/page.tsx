import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getLevelContentsByAudience } from "@/lib/levels/queries";

export default async function AdminKidsLevelsListPage() {
  await requireAdmin();
  const rows = await getLevelContentsByAudience("kids");

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Level content — Kids"
        description="Titles, descriptions, and optional video URLs shown on the public “What’s my level?” page."
      />
      <Section title="Levels">
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {rows.map((row) => (
            <li key={row.skillLevel}>
              <Link
                href={`/admin/settings/levels/${row.skillLevel}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-[var(--muted)]/40"
              >
                <span className="font-medium">{row.title}</span>
                <span className="text-[var(--muted-foreground)]">{row.skillLevel}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

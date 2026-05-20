import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { LevelCard } from "@/components/levels/level-card";
import { getLevelContentsByAudience } from "@/lib/levels/queries";

export default async function AdultsLevelsPage() {
  const rows = await getLevelContentsByAudience("adults");

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Adults"
        title="Adult skill levels"
        description="Recreational groupings so you can find the right class intensity."
        actions={
          <Link
            href="/levels"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            All tracks
          </Link>
        }
      />
      <Section title="Levels">
        <div className="space-y-6">
          {rows.map((row) => (
            <LevelCard key={row.skillLevel} row={row} />
          ))}
        </div>
      </Section>
    </div>
  );
}

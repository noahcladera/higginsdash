import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { LevelCard } from "@/components/levels/level-card";
import { getLevelContentsByAudience } from "@/lib/levels/queries";

export default async function KidsLevelsPage() {
  const rows = await getLevelContentsByAudience("kids");

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Kids"
        title="Tenniskids levels"
        description="How we describe each stage on court. Your coach sets the official level in the system."
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

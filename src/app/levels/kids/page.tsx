import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MedalLevelCard } from "@/components/medals/medal-level-card";
import { getMedalLevelContents } from "@/lib/medals/queries";

export default async function KidsLevelsPage() {
  const rows = await getMedalLevelContents();

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Kids"
        title="Medal levels"
        description="How we describe each stage on court. Your coach sets the official medal in the system."
        actions={
          <Link
            href="/levels"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            All tracks
          </Link>
        }
      />
      <Section title="Medal ladder">
        <div className="space-y-6">
          {rows.map((row) => (
            <MedalLevelCard key={row.medalLevel} row={row} />
          ))}
        </div>
      </Section>
    </div>
  );
}

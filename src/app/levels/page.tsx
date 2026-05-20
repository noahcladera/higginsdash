import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";

export default function WhatsMyLevelPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Guide"
        title="What's my level?"
        description="Pick kids (Tenniskids) or adults to read what each skill level means. Your coach can help you choose the right fit."
      />
      <Section title="Choose a track">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/levels/kids"
            className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm transition-colors hover:border-[var(--triaz)]/40 hover:bg-[var(--muted)]/30"
          >
            <h2 className="font-display text-2xl font-medium tracking-tight">
              Kids
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Tenniskids progression — red through yellow.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-[var(--triaz-ink)] group-hover:underline">
              View kids levels →
            </span>
          </Link>
          <Link
            href="/levels/adults"
            className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm transition-colors hover:border-[var(--randwijck)]/40 hover:bg-[var(--muted)]/30"
          >
            <h2 className="font-display text-2xl font-medium tracking-tight">
              Adults
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Recreational buckets from beginner through advanced.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-[var(--randwijck-ink)] group-hover:underline">
              View adult levels →
            </span>
          </Link>
        </div>
      </Section>
    </div>
  );
}

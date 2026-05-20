import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getTerms } from "@/lib/tenant";

/**
 * Programs admin — the "storefront" cards parents see in the portal
 * catalog. Each row links into an edit page where admins can upload
 * a cover image and tweak the public description.
 *
 * The schedule (class series, ages, pricing) remains owned by the
 * class-series form; this surface is intentionally narrow — it's just
 * the presentation layer.
 */
export default async function AdminProgramsPage() {
  await requireAdmin();
  const t = await getTerms();

  const programs = await prisma.program.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      targetAudience: true,
      isActive: true,
      isPubliclyListed: true,
      coverImageUrl: true,
      descriptionPublic: true,
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Catalog"
        title={t.program.plural}
        description={`The cards ${t.parent.plural.toLowerCase()} see on the portal catalog. Upload a cover image and a short description that answers 'what is this?' in one sentence.`}
        actions={
          <Button asChild>
            <Link href="/admin/programs/new">New {t.program.singular}</Link>
          </Button>
        }
      />

      {programs.length === 0 ? (
        <EmptyState
          title={`No ${t.program.plural.toLowerCase()} yet`}
          description={`${t.program.plural} usually appear when you publish class series, but you can also create an empty ${t.program.singular.toLowerCase()} first and attach series later under Classes.`}
          action={
            <Button asChild>
              <Link href="/admin/programs/new">New {t.program.singular}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {programs.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/programs/${p.slug}`}
                className="group block overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] transition-colors hover:border-[var(--foreground)]/40"
              >
                <div className="aspect-[16/9] w-full overflow-hidden bg-[var(--surface-strong)]">
                  {p.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverImageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                      No cover image
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-base font-semibold">{p.name}</div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                      {p.targetAudience}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                    {p.descriptionPublic || "No description yet."}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/components/ui/section";
import { updateCourt, archiveCourt } from "../actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CourtEditPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const court = await prisma.court.findUnique({
    where: { id },
    include: { club: { select: { name: true } } },
  });
  if (!court) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Courts", href: "/admin/courts" },
          { label: court.club.name },
        ]}
      />
      <PageHeader
        kicker="Admin · Courts"
        title={court.name}
        description={`${court.surface} · ${court.qualityTier}${court.isActive ? "" : " · archived"}`}
      />

      <form action={updateCourt} className="max-w-md space-y-4">
        <input type="hidden" name="courtId" value={court.id} />
        <div className="space-y-1">
          <Label htmlFor="name">Court name</Label>
          <Input id="name" name="name" defaultValue={court.name} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="displayOrder">Display order</Label>
          <Input
            id="displayOrder"
            name="displayOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={court.displayOrder}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Lower numbers appear first in the booking calendar. Use this to put
            Court 4 before Court 3, etc.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="surface">Surface</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Used by staff when planning lessons and operations.
          </p>
          <select id="surface" name="surface" className={selectClass} defaultValue={court.surface}>
            <option value="clay">Clay</option>
            <option value="hard">Hard</option>
            <option value="indoor_hard">Indoor hard</option>
            <option value="grass">Grass</option>
            <option value="multi_use">Multi-use</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="qualityTier">Tier</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Distinguish premium spaces from practice and walk-on areas.
          </p>
          <select
            id="qualityTier"
            name="qualityTier"
            className={selectClass}
            defaultValue={court.qualityTier}
          >
            <option value="premium">Premium</option>
            <option value="standard">Standard</option>
            <option value="practice_only">Practice only</option>
            <option value="walk_on_only">Walk-on only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="isBookable"
            name="isBookable"
            defaultChecked={court.isBookable}
          />
          <Label htmlFor="isBookable">Bookable (uncheck for walk-on only)</Label>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={court.notes ?? ""}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" tone="triaz">
            Save
          </Button>
          <Button asChild variant="outline" type="button">
            <Link href="/admin/courts">Cancel</Link>
          </Button>
        </div>
      </form>

      <Section
        title="Archive"
        description={`Hide this court from new scheduling while keeping historical bookings and classes intact.`}
      >
        <form action={archiveCourt} className="max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <input type="hidden" name="courtId" value={court.id} />
          <input
            type="hidden"
            name="archive"
            value={court.isActive ? "archive" : "unarchive"}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            This will {court.isActive ? "archive" : "restore"} the court. Existing
            history stays untouched.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="submit"
              variant={court.isActive ? "destructive" : "outline"}
              size="sm"
            >
              {court.isActive ? "Archive court" : "Unarchive court"}
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

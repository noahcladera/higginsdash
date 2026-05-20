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
import { updateCourt } from "../actions";

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
        description={`${court.surface} · ${court.qualityTier}`}
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

        <div className="flex items-center gap-2">
          <Checkbox
            id="isBookable"
            name="isBookable"
            defaultChecked={court.isBookable}
          />
          <Label htmlFor="isBookable">Bookable (uncheck for walk-on only)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="isLit" name="isLit" defaultChecked={court.isLit} />
          <Label htmlFor="isLit">Has lights</Label>
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
    </div>
  );
}

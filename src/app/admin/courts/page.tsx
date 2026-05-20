import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getTerms } from "@/lib/tenant";
import { createCourt, archiveCourt } from "./actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Bookable-spaces catalog page (called "Courts" in tennis tenants,
 * "Studios" / "Classrooms" / "Rooms" in others). Lists spaces grouped
 * by club with inline create/archive/edit controls.
 */
export default async function AdminCourtsPage() {
  await requireAdmin();
  const t = await getTerms();
  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      courts: { orderBy: { displayOrder: "asc" } },
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={t.court.plural}
        description={`Manage each ${t.court.singular.toLowerCase()} at every ${t.club.singular.toLowerCase()}. Add new ones, rename, reorder, and archive when no longer used.`}
      />
      {clubs.map((club) => (
        <section key={club.id} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-medium tracking-tight">
              {club.name}
            </h2>
            <Badge variant="soft" tone="neutral">
              {
                club.courts.filter((court) => court.isActive).length
              }{" "}
              active
            </Badge>
          </div>

          <form
            action={createCourt}
            className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <input type="hidden" name="clubId" value={club.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={`name-${club.id}`}>
                  {t.court.singular} name
                </Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Label shown in booking and admin calendars.
                </p>
                <Input
                  id={`name-${club.id}`}
                  name="name"
                  placeholder="Court 5"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`order-${club.id}`}>Display order</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Lower numbers appear first.
                </p>
                <Input
                  id={`order-${club.id}`}
                  name="displayOrder"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={
                    club.courts.reduce(
                      (max, court) => Math.max(max, court.displayOrder),
                      0,
                    ) + 1
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`surface-${club.id}`}>Surface</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Used for operational filtering and planning.
                </p>
                <select
                  id={`surface-${club.id}`}
                  name="surface"
                  className={selectClass}
                  defaultValue="clay"
                >
                  <option value="clay">Clay</option>
                  <option value="hard">Hard</option>
                  <option value="indoor_hard">Indoor hard</option>
                  <option value="grass">Grass</option>
                  <option value="multi_use">Multi-use</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`tier-${club.id}`}>Tier</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Helps distinguish premium vs overflow spaces.
                </p>
                <select
                  id={`tier-${club.id}`}
                  name="qualityTier"
                  className={selectClass}
                  defaultValue="standard"
                >
                  <option value="premium">Premium</option>
                  <option value="standard">Standard</option>
                  <option value="practice_only">Practice only</option>
                  <option value="walk_on_only">Walk-on only</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor={`notes-${club.id}`}>Internal notes</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Optional context for staff only.
                </p>
                <Textarea id={`notes-${club.id}`} name="notes" rows={2} />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isBookable" defaultChecked />
                  Bookable
                </label>
                <Button type="submit" tone="triaz">
                  Add {t.court.singular.toLowerCase()}
                </Button>
              </div>
            </div>
          </form>

          <div className="rounded-md border border-[var(--border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Bookable</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {club.courts.filter((court) => court.isActive).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                    >
                      <EmptyState
                        title={`No ${t.court.plural.toLowerCase()} yet`}
                        description={`Add the first ${t.court.singular.toLowerCase()} for ${club.name} using the form above.`}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  club.courts
                    .filter((court) => court.isActive)
                    .map((court) => (
                    <TableRow key={court.id}>
                      <TableCell className="text-xs tabular-nums text-[var(--muted-foreground)]">
                        {court.displayOrder}
                      </TableCell>
                      <TableCell className="font-medium">
                        {court.name}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted-foreground)]">
                        {court.surface}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted-foreground)]">
                        {court.qualityTier}
                      </TableCell>
                      <TableCell>
                        {court.isBookable ? (
                          <Badge tone="success" variant="soft">
                            bookable
                          </Badge>
                        ) : (
                          <Badge tone="neutral" variant="soft">
                            walk-on only
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-3 text-xs">
                          <Link
                            href={`/admin/courts/${court.id}`}
                            className="underline hover:text-[var(--accent)]"
                          >
                            edit
                          </Link>
                          <form action={archiveCourt}>
                            <input type="hidden" name="courtId" value={court.id} />
                            <input type="hidden" name="archive" value="archive" />
                            <button
                              type="submit"
                              className="text-rose-700 underline hover:text-rose-800"
                            >
                              archive
                            </button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

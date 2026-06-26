import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { listCriteriaForLevelAdmin } from "@/lib/levels/criteria";
import {
  archiveLevelCriterion,
  createLevelCriterion,
  unarchiveLevelCriterion,
  updateLevelContent,
  updateLevelCriterion,
} from "../actions";
import { LevelContentForm } from "../level-content-form";

const VALID = new Set([
  "red_1",
  "red_2",
  "red_3",
  "orange_1",
  "orange_2",
  "orange_3",
  "green_1",
  "green_2",
  "yellow",
  "adult_beginner_beginner",
  "adult_beginner_intermediate",
  "adult_advanced_beginner",
  "adult_intermediate",
  "adult_advanced",
]);

export default async function AdminEditLevelContentPage({
  params,
}: {
  params: Promise<{ skillLevel: string }>;
}) {
  await requireAdmin();
  const { skillLevel: raw } = await params;
  if (!VALID.has(raw)) notFound();

  const skillLevel = raw as
    | "red_1"
    | "red_2"
    | "red_3"
    | "orange_1"
    | "orange_2"
    | "orange_3"
    | "green_1"
    | "green_2"
    | "yellow"
    | "adult_beginner_beginner"
    | "adult_beginner_intermediate"
    | "adult_advanced_beginner"
    | "adult_intermediate"
    | "adult_advanced";

  const [row, criteria] = await Promise.all([
    prisma.levelContent.findUnique({ where: { skillLevel } }),
    listCriteriaForLevelAdmin(skillLevel),
  ]);
  if (!row) notFound();

  const backHref =
    row.audience === "kids"
      ? "/admin/settings/levels/kids"
      : "/admin/settings/levels/adults";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Edit level"
        title={row.title}
        description={`Skill level key: ${row.skillLevel}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={backHref}>Back to list</Link>
          </Button>
        }
      />

      <Section title="Content">
        <LevelContentForm
          action={updateLevelContent}
          returnTo={backHref}
          row={{
            skillLevel: row.skillLevel,
            title: row.title,
            shortDescription: row.shortDescription,
            longDescription: row.longDescription,
            howToGraduate: row.howToGraduate,
            sortOrder: row.sortOrder,
            videoUrl: row.videoUrl,
          }}
        />
      </Section>

      <Section
        title="Graduation criteria"
        description="Coaches tick these per student. When all are ticked, they get a one-click promote button on the student page."
      >
        <div className="max-w-3xl space-y-6">
          {criteria.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No criteria yet — add the first one below.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
              {criteria.map((c) => {
                const isArchived = c.archivedAt != null;
                return (
                  <li key={c.id} className="p-4">
                    <form
                      action={updateLevelCriterion}
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        type="hidden"
                        name="skillLevel"
                        value={skillLevel}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <input
                            name="label"
                            required
                            defaultValue={c.label}
                            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-medium"
                          />
                          <textarea
                            name="description"
                            rows={2}
                            placeholder="Optional coach-facing context"
                            defaultValue={c.description ?? ""}
                            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <label className="text-xs text-[var(--muted-foreground)]">
                            Sort
                            <input
                              name="sortOrder"
                              type="number"
                              min={0}
                              defaultValue={c.sortOrder}
                              className="ml-2 w-20 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
                            />
                          </label>
                          {isArchived ? (
                            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                              Archived
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="submit" size="sm">
                          Save
                        </Button>
                        {isArchived ? (
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            formAction={unarchiveLevelCriterion}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            formAction={archiveLevelCriterion}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <form action={createLevelCriterion} className="space-y-3 rounded-md border border-dashed border-[var(--border)] p-4">
            <input type="hidden" name="skillLevel" value={skillLevel} />
            <h3 className="text-sm font-medium">Add a criterion</h3>
            <div>
              <label htmlFor="new-label" className="text-xs font-medium">
                Label
              </label>
              <input
                id="new-label"
                name="label"
                required
                placeholder="E.g. Rallies 5 forehands inside the service line"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="new-description" className="text-xs font-medium">
                Description (optional)
              </label>
              <textarea
                id="new-description"
                name="description"
                rows={2}
                placeholder="Optional coach-facing notes"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" size="sm">
              Add criterion
            </Button>
          </form>
        </div>
      </Section>
    </div>
  );
}

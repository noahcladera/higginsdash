"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TERM_KEY_PATHS } from "@/lib/tenant/terms";
import { useActionFeedback } from "@/lib/feedback";

import { resetOrgTerms, updateOrgTerms } from "../actions";

/**
 * Terminology editor.
 *
 * Inputs grouped under the section the term belongs to. Each section
 * has a small live preview showing two example sentences re-rendered
 * with the staged values, so the admin can confirm the rename reads
 * naturally.
 *
 * We don't validate the input beyond a length cap — anything goes,
 * including emoji, accents, capitals. The empty string is meaningful:
 * it means "use the preset default", and is what `Reset` writes.
 */

interface SectionDef {
  id: string;
  label: string;
  description: string;
  paths: ReadonlyArray<string>;
  preview: (read: (path: string) => string) => React.ReactNode;
}

const SECTIONS: ReadonlyArray<SectionDef> = [
  {
    id: "people",
    label: "People",
    description: "Staff, families, learners, account holders.",
    paths: [
      "coach.singular",
      "coach.plural",
      "coach.role",
      "student.singular",
      "student.plural",
      "member.singular",
      "member.plural",
      "household.singular",
      "household.plural",
      "parent.singular",
      "parent.plural",
    ],
    preview: (read) => (
      <>
        <p>
          Add a <strong>{read("coach.singular")}</strong> to your{" "}
          {read("coach.plural").toLowerCase()} roster.
        </p>
        <p>
          {read("parent.plural")} can sign up their{" "}
          {read("student.plural").toLowerCase()} from a single{" "}
          {read("household.singular").toLowerCase()} account.
        </p>
      </>
    ),
  },
  {
    id: "programs",
    label: "Programs & catalog",
    description: "Classes, lessons, programs, seasons, levels.",
    paths: [
      "class.singular",
      "class.plural",
      "privateLesson.singular",
      "privateLesson.plural",
      "program.singular",
      "program.plural",
      "season.singular",
      "season.plural",
      "enrollment.singular",
      "enrollment.plural",
      "level.singular",
      "level.plural",
    ],
    preview: (read) => (
      <>
        <p>
          Browse weekly <strong>{read("class.plural").toLowerCase()}</strong> by{" "}
          {read("program.singular").toLowerCase()} and{" "}
          {read("level.singular").toLowerCase()}.
        </p>
        <p>
          Each {read("season.singular").toLowerCase()} has its own list of{" "}
          {read("enrollment.plural").toLowerCase()}.
        </p>
      </>
    ),
  },
  {
    id: "spaces",
    label: "Spaces",
    description: "Bookable spaces and the venues they live at.",
    paths: [
      "court.singular",
      "court.plural",
      "venue.singular",
      "venue.plural",
      "club.singular",
      "club.plural",
    ],
    preview: (read) => (
      <>
        <p>
          Reserve a <strong>{read("court.singular").toLowerCase()}</strong> at
          your favourite {read("venue.singular").toLowerCase()}.
        </p>
        <p>
          Members can belong to one or more {read("club.plural").toLowerCase()}.
        </p>
      </>
    ),
  },
  {
    id: "competition",
    label: "Competition",
    description: "Ladders, matches.",
    paths: [
      "ladder.singular",
      "ladder.plural",
      "match.singular",
      "match.plural",
    ],
    preview: (read) => (
      <>
        <p>
          Climb the <strong>{read("ladder.singular").toLowerCase()}</strong> by
          winning {read("match.plural").toLowerCase()}.
        </p>
      </>
    ),
  },
  {
    id: "verbs",
    label: "Actions & misc",
    description: "Verbs, attendance, membership labels.",
    paths: [
      "bookVerb",
      "enrollVerb",
      "attendance",
      "membership.singular",
      "membership.plural",
    ],
    preview: (read) => (
      <>
        <p>
          <strong>{read("bookVerb")}</strong> a{" "}
          {read("court.singular").toLowerCase()} ·{" "}
          <strong>{read("enrollVerb")}</strong> in a{" "}
          {read("class.singular").toLowerCase()}.
        </p>
        <p>
          Take {read("attendance").toLowerCase()} for every{" "}
          {read("class.singular").toLowerCase()}.
        </p>
      </>
    ),
  },
];

export function TerminologyEditor({
  initial,
  readOnly = false,
}: {
  initial: Record<string, string>;
  readOnly?: boolean;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const { run, pending, error } = useActionFeedback({
    success: "Saved",
    successDescription: "Reload any open tab to see it everywhere.",
  });

  function read(path: string): string {
    return values[path] ?? initial[path] ?? "";
  }

  function onSave() {
    const form = new FormData();
    for (const { path } of TERM_KEY_PATHS) {
      const v = values[path] ?? "";
      form.set(path, v);
    }
    run(() => updateOrgTerms(form));
  }

  async function onReset() {
    if (
      !confirm(
        "Reset every term to the preset's defaults? Your custom renames on this screen will be lost.",
      )
    ) {
      return;
    }
    run(async () => {
      const result = await resetOrgTerms();
      if (result.ok) window.location.reload();
      return result;
    });
  }

  return (
    <div className="space-y-8">
      {!readOnly && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]">
          {error && (
            <span className="text-xs text-[var(--destructive)]">{error}</span>
          )}
          <Button variant="ghost" type="button" onClick={onReset} disabled={pending}>
            Reset to preset defaults
          </Button>
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save terminology"}
          </Button>
        </div>
      )}

      {readOnly && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
          Your <strong>glossary is locked</strong> to your industry preset. These
          are the words members and staff see throughout the app. Contact{" "}
          <strong className="text-[var(--foreground)]">platform support</strong>{" "}
          if a label truly needs to change.
        </div>
      )}

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <header className="mb-4">
            <h2 className="text-lg font-semibold">{section.label}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {section.description}
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {section.paths.map((path) => {
                const meta = TERM_KEY_PATHS.find((m) => m.path === path);
                if (!meta) return null;
                return (
                  <div key={path} className="space-y-1">
                    <Label htmlFor={`term-${path}`}>{meta.label}</Label>
                    <Input
                      id={`term-${path}`}
                      value={values[path] ?? ""}
                      placeholder={initial[path] ?? ""}
                      readOnly={readOnly}
                      disabled={readOnly}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [path]: e.target.value,
                        }))
                      }
                      maxLength={60}
                    />
                    {meta.hint && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {meta.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <aside className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Live preview
              </div>
              <div className="space-y-2 text-sm">{section.preview(read)}</div>
            </aside>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Terminology / glossary system.
 *
 * Every domain noun the app shows to humans goes through this module. A
 * tennis club calls them Coaches and Courts; a music school calls them
 * Teachers and Studios; an after-school program calls them Instructors
 * and Rooms. Same code, different vocabulary.
 *
 * Two halves:
 *   - This file (pure data + helpers, browser-safe).
 *   - `terms.server.ts` — `getTerms()` reads the active org and merges
 *     overrides on top of the defaults, cached per request.
 *
 * Use from server components via `await getTerms()`.
 * Use from client components via `useTerms()` from
 * `@/components/tenant/terms-provider`.
 */

/**
 * Most domain words have singular + plural variants because copy reads
 * better that way ("Add Coach" vs "Coaches in your roster"). Verbs are
 * single strings.
 *
 * `role` on `coach` is the title that goes into headings like "Your role:
 * Coach"; sometimes that's a slightly different word from the noun.
 */
export interface Pair {
  singular: string;
  plural: string;
}

export interface Terms {
  // ── People ─────────────────────────────────────────────────────────────────
  coach: Pair & { role: string };
  student: Pair;
  member: Pair;
  household: Pair;
  parent: Pair;

  // ── Programs / catalog ─────────────────────────────────────────────────────
  class: Pair;
  /** Sub-section within a class — what we call a "group" in the admin UI
   *  when a series is split (e.g. parallel ability tiers, beginner-vs-
   *  advanced lanes). Music schools say "section", dance studios say
   *  "level". Singular + plural. */
  classGroup: Pair;
  privateLesson: Pair;
  program: Pair;
  season: Pair;
  enrollment: Pair;
  level: Pair;

  // ── Spaces ─────────────────────────────────────────────────────────────────
  court: Pair;
  venue: Pair;
  club: Pair;
  /** Pickup partner / on-site host — e.g. an after-school's school name,
   *  a corporate-wellness's office. Distinct from `venue`: the school
   *  is *who* hosts, the venue is *where*. */
  school: Pair;

  // ── Competition ────────────────────────────────────────────────────────────
  ladder: Pair;
  match: Pair;

  // ── Verbs / glue ───────────────────────────────────────────────────────────
  /** "Book", "Reserve", "Schedule" — for the act of booking a space. */
  bookVerb: string;
  /** "Enrol", "Sign up", "Register" — for joining a class. */
  enrollVerb: string;
  /** "Attendance", "Roll call". */
  attendance: string;
  /** "Membership". */
  membership: Pair;
}

/**
 * Per-tenant overrides for {@link Terms}. Same shape, but every leaf is
 * optional. The DB stores this as JSON; `getTerms()` merges it with
 * `DEFAULT_TERMS`. Unknown keys are ignored, so old/extra data in the
 * column never crashes a render.
 */
export type TermsOverrides = {
  [K in keyof Terms]?: Terms[K] extends Pair & infer Extra
    ? { [P in keyof (Pair & Extra)]?: string }
    : Terms[K] extends Pair
      ? { singular?: string; plural?: string }
      : string;
};

/**
 * The neutral, generic-but-readable defaults. This is what an org sees
 * when it has no preset and no overrides. Tennis-club specifics ("Court")
 * stay here because the app's installed base today is tennis clubs, but
 * any preset can override every key.
 */
export const DEFAULT_TERMS: Terms = {
  // People
  coach: { singular: "Coach", plural: "Coaches", role: "Coach" },
  student: { singular: "Student", plural: "Students" },
  member: { singular: "Member", plural: "Members" },
  household: { singular: "Household", plural: "Households" },
  parent: { singular: "Parent", plural: "Parents" },

  // Programs
  class: { singular: "Class", plural: "Classes" },
  classGroup: { singular: "Group", plural: "Groups" },
  privateLesson: { singular: "Private lesson", plural: "Private lessons" },
  program: { singular: "Program", plural: "Programs" },
  season: { singular: "Season", plural: "Seasons" },
  enrollment: { singular: "Enrolment", plural: "Enrolments" },
  level: { singular: "Level", plural: "Levels" },

  // Spaces
  court: { singular: "Court", plural: "Courts" },
  venue: { singular: "Venue", plural: "Venues" },
  club: { singular: "Club", plural: "Clubs" },
  school: { singular: "School", plural: "Schools" },

  // Competition
  ladder: { singular: "Ladder", plural: "Ladders" },
  match: { singular: "Match", plural: "Matches" },

  // Verbs / glue
  bookVerb: "Book",
  enrollVerb: "Enrol",
  attendance: "Attendance",
  membership: { singular: "Membership", plural: "Memberships" },
};

/**
 * Every (top-level, leaf-path) key admins can edit. Used by the admin
 * "Terminology" page to render an input for each, and by the JSON
 * coercer below.
 */
export const TERM_KEY_PATHS: ReadonlyArray<{
  path: string;
  label: string;
  hint: string;
}> = [
  // People
  { path: "coach.singular", label: "Coach (singular)", hint: 'e.g. "Coach", "Teacher", "Instructor"' },
  { path: "coach.plural", label: "Coaches (plural)", hint: 'e.g. "Coaches", "Teachers", "Instructors"' },
  { path: "coach.role", label: "Coach role label", hint: 'How the role appears in the role-switcher.' },
  { path: "student.singular", label: "Student (singular)", hint: 'e.g. "Student", "Player", "Kid", "Athlete"' },
  { path: "student.plural", label: "Students (plural)", hint: 'e.g. "Students", "Players", "Kids"' },
  { path: "member.singular", label: "Member (singular)", hint: 'e.g. "Member", "Subscriber"' },
  { path: "member.plural", label: "Members (plural)", hint: 'e.g. "Members", "Subscribers"' },
  { path: "household.singular", label: "Household (singular)", hint: 'e.g. "Household", "Family", "Account"' },
  { path: "household.plural", label: "Households (plural)", hint: 'e.g. "Households", "Families"' },
  { path: "parent.singular", label: "Parent (singular)", hint: 'e.g. "Parent", "Guardian", "Account holder"' },
  { path: "parent.plural", label: "Parents (plural)", hint: 'e.g. "Parents", "Guardians"' },

  // Programs
  { path: "class.singular", label: "Class (singular)", hint: 'e.g. "Class", "Lesson", "Session", "Course"' },
  { path: "class.plural", label: "Classes (plural)", hint: 'e.g. "Classes", "Lessons", "Sessions"' },
  { path: "classGroup.singular", label: "Group (singular)", hint: 'A sub-section within a class — "Group", "Section", "Lane", "Squad"' },
  { path: "classGroup.plural", label: "Groups (plural)", hint: '' },
  { path: "privateLesson.singular", label: "Private lesson (singular)", hint: '1-on-1 session label.' },
  { path: "privateLesson.plural", label: "Private lessons (plural)", hint: '1-on-1 sessions, plural.' },
  { path: "program.singular", label: "Program (singular)", hint: 'Catalog grouping — "Program", "Department", "Track"' },
  { path: "program.plural", label: "Programs (plural)", hint: '' },
  { path: "season.singular", label: "Season (singular)", hint: 'e.g. "Season", "Term", "Semester", "Cycle"' },
  { path: "season.plural", label: "Seasons (plural)", hint: '' },
  { path: "enrollment.singular", label: "Enrolment (singular)", hint: 'e.g. "Enrolment", "Sign-up", "Registration"' },
  { path: "enrollment.plural", label: "Enrolments (plural)", hint: '' },
  { path: "level.singular", label: "Level (singular)", hint: 'Skill rung — "Level", "Grade", "Belt", "Rating"' },
  { path: "level.plural", label: "Levels (plural)", hint: '' },

  // Spaces
  { path: "court.singular", label: "Court / studio (singular)", hint: 'e.g. "Court", "Studio", "Classroom", "Room", "Field"' },
  { path: "court.plural", label: "Courts / studios (plural)", hint: '' },
  { path: "venue.singular", label: "Venue (singular)", hint: 'Physical address — "Venue", "Location", "Site", "Branch"' },
  { path: "venue.plural", label: "Venues (plural)", hint: '' },
  { path: "club.singular", label: "Club (singular)", hint: 'Top-level org unit — "Club", "School", "Academy", "Studio"' },
  { path: "club.plural", label: "Clubs (plural)", hint: '' },
  { path: "school.singular", label: "School (singular)", hint: 'Pickup partner / on-site host — "School", "Office", "Site"' },
  { path: "school.plural", label: "Schools (plural)", hint: '' },

  // Competition
  { path: "ladder.singular", label: "Ladder (singular)", hint: 'Challenge ranking — "Ladder", "Ranking"' },
  { path: "ladder.plural", label: "Ladders (plural)", hint: '' },
  { path: "match.singular", label: "Match (singular)", hint: 'e.g. "Match", "Game", "Bout"' },
  { path: "match.plural", label: "Matches (plural)", hint: '' },

  // Verbs / glue
  { path: "bookVerb", label: "Book (verb)", hint: 'Action verb on booking buttons. "Book", "Reserve", "Schedule".' },
  { path: "enrollVerb", label: "Enrol (verb)", hint: '"Enrol", "Sign up", "Register".' },
  { path: "attendance", label: "Attendance", hint: 'Label for the roll-call screen.' },
  { path: "membership.singular", label: "Membership (singular)", hint: '"Membership", "Subscription"' },
  { path: "membership.plural", label: "Memberships (plural)", hint: '' },
] as const;

function setPath(target: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = cursor[part];
    if (!next || typeof next !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function getPath(source: unknown, path: string): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const parts = path.split(".");
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/**
 * Coerce a JSON value coming back from the database into a typed
 * `TermsOverrides`. Walks `TERM_KEY_PATHS` so any unknown / mistyped
 * field is silently dropped — keeps the renderer stable even if an
 * old DB row has stale shape.
 */
export function parseTermsJson(value: unknown): TermsOverrides {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const { path } of TERM_KEY_PATHS) {
    const v = getPath(value, path);
    if (typeof v === "string" && v.trim().length > 0) {
      setPath(out, path, v);
    }
  }
  return out as TermsOverrides;
}

/**
 * Deep-merge `overrides` (per-tenant strings) over `base` (defaults).
 * Only honours keys that exist on `Terms`; anything else is dropped.
 */
export function mergeTerms(
  base: Terms,
  overrides: TermsOverrides | null | undefined,
): Terms {
  if (!overrides) return base;
  const out: Terms = JSON.parse(JSON.stringify(base)) as Terms;
  for (const { path } of TERM_KEY_PATHS) {
    const v = getPath(overrides, path);
    if (typeof v === "string" && v.trim().length > 0) {
      setPath(out as unknown as Record<string, unknown>, path, v.trim());
    }
  }
  return out;
}

/**
 * Render a copy template with `{some.path}` placeholders. Unknown paths
 * are left as the literal placeholder text so a typo is visible in the
 * rendered UI (rather than disappearing silently).
 *
 * Example:
 *   applyTerms("This will un-enrol {student.plural}.", terms)
 *     // → "This will un-enrol Students."
 */
export function applyTerms(template: string, terms: Terms): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_.]*)\}/g, (raw, path) => {
    const value = getPath(terms as unknown, path);
    return typeof value === "string" ? value : raw;
  });
}

/** Sentence-case the first character of a string (no other case changes). */
export function capitalize(value: string): string {
  if (!value) return value;
  return value[0]!.toUpperCase() + value.slice(1);
}

/** Lowercase the first character of a string. Useful inside sentences. */
export function decapitalize(value: string): string {
  if (!value) return value;
  return value[0]!.toLowerCase() + value.slice(1);
}

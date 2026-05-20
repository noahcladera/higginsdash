/**
 * Industry presets.
 *
 * A preset is a `(features, terms, productMode)` triple — pure data, no
 * I/O. Admins pick a preset on the "Presets" settings page; we upsert
 * those values into the org's `organizations` row and they can then
 * customise individual flags / terms on top.
 *
 * The bundled presets cover common lesson-business shapes (full club,
 * music-style academy, partner-school delivery, solo practice, studio-style
 * drop-in, events-first societies or promoters, plus start-from-scratch).
 * Add a preset by appending to `INDUSTRY_PRESETS` below — the admin UI picks
 * them up automatically.
 */
import { BASE_FEATURE_FLAGS, type FeatureFlags } from "./features";
import { DEFAULT_TERMS, type Terms, type TermsOverrides } from "./terms";

/** Full explicit glossary for the default tennis-club preset (CI requires every leaf on non-custom presets). */
const TENNIS_CLUB_TERMS: TermsOverrides = JSON.parse(
  JSON.stringify(DEFAULT_TERMS),
) as TermsOverrides;

export type ProductMode = "club" | "programs" | "custom";

export interface IndustryPreset {
  /** Stable identifier saved in `organizations.preset_slug`. */
  slug: string;
  /** Short label rendered on the preset card. */
  label: string;
  /** One-paragraph "is this you?" copy on the card. */
  description: string;
  productMode: ProductMode;
  /** Partial overrides on top of `BASE_FEATURE_FLAGS`. */
  features: Partial<FeatureFlags>;
  /** Partial overrides on top of `DEFAULT_TERMS`. */
  terms: TermsOverrides;
}

// ─── Tennis Club ────────────────────────────────────────────────────────────
const TENNIS_CLUB: IndustryPreset = {
  slug: "tennis_club",
  label: "Full club / multi-site operator",
  description:
    "The broadest bundle: memberships, member bookable spaces, recurring weekly offerings, ranked play and leagues, partner-school delivery, retail, and optional regional federation integrations where applicable.",
  productMode: "club",
  features: {
    coaches: true,
    households: true,
    students: true,
    parentAlsoPlays: true,
    coachInvites: true,
    coachAvailability: true,
    coachSubs: true,
    coachPrivateLessonInvoicing: true,
    programs: true,
    seasons: true,
    classes: true,
    classSeries: true,
    classSubgroups: true,
    events: true,
    levels: true,
    levelProgression: true,
    recurringBlocks: true,
    trialInterest: true,
    classTransfers: true,
    venues: true,
    courts: true,
    courtBookings: true,
    multiClub: true,
    clubAccessControl: true,
    ladder: true,
    leagues: true,
    tournaments: true,
    memberships: true,
    membershipCoverage: true,
    householdCredits: true,
    payments: true,
    refunds: true,
    proShop: true,
    schoolPartnerships: true,
    pickupLogistics: true,
    volunteerDuty: true,
    knltbIntegration: true,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: true,
    inbox: true,
    notifications: true,
    auditLog: true,
  },
  terms: TENNIS_CLUB_TERMS,
};

// ─── Music School ───────────────────────────────────────────────────────────
const MUSIC_SCHOOL: IndustryPreset = {
  slug: "music_school",
  label: "Music school / academy",
  description:
    "Group offerings plus recurring one-to-one instruction across multiple tracks. No member self-service space booking or competition modules. Teachers, rooms, curriculum stages (e.g. exam grades), per-household billing.",
  productMode: "programs",
  features: {
    coaches: true,
    households: true,
    students: true,
    coachInvites: true,
    coachAvailability: true,
    coachPrivateLessonInvoicing: true,
    programs: true,
    seasons: true,
    classes: true,
    classSeries: true,
    classSubgroups: true,
    events: true,
    levels: true,
    levelProgression: true,
    recurringBlocks: true,
    trialInterest: true,
    classTransfers: true,
    venues: true,
    memberships: false,
    householdCredits: true,
    payments: true,
    refunds: true,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: true,
    inbox: true,
    notifications: true,
    auditLog: true,
  },
  terms: {
    coach: { singular: "Teacher", plural: "Teachers", role: "Teacher" },
    student: { singular: "Student", plural: "Students" },
    member: { singular: "Family", plural: "Families" },
    household: { singular: "Family", plural: "Families" },
    parent: { singular: "Parent", plural: "Parents" },
    class: { singular: "Lesson", plural: "Lessons" },
    privateLesson: { singular: "1:1 lesson", plural: "1:1 lessons" },
    program: { singular: "Department", plural: "Departments" },
    season: { singular: "Term", plural: "Terms" },
    enrollment: { singular: "Enrolment", plural: "Enrolments" },
    level: { singular: "Grade", plural: "Grades" },
    court: { singular: "Studio", plural: "Studios" },
    venue: { singular: "Location", plural: "Locations" },
    club: { singular: "Academy", plural: "Academies" },
    bookVerb: "Schedule",
    enrollVerb: "Enrol",
    attendance: "Attendance",
    membership: { singular: "Plan", plural: "Plans" },
    classGroup: { singular: "Section", plural: "Sections" },
    ladder: { singular: "Ladder", plural: "Ladders" },
    match: { singular: "Performance", plural: "Performances" },
    school: { singular: "School", plural: "Schools" },
  },
};

// ─── After-school program ──────────────────────────────────────────────────
const AFTER_SCHOOL: IndustryPreset = {
  slug: "after_school",
  label: "After-school program",
  description:
    "Programs that run inside (or pick up from) partner schools. Families register learners; instructors run sessions on-site; term-based payments. No recurring memberships, member space booking, or competition modules.",
  productMode: "programs",
  features: {
    coaches: true,
    households: true,
    students: true,
    coachInvites: true,
    coachAvailability: true,
    coachSubs: true,
    programs: true,
    seasons: true,
    classes: true,
    classSeries: true,
    events: true,
    levels: false,
    levelProgression: false,
    trialInterest: true,
    classTransfers: true,
    venues: true,
    schoolPartnerships: true,
    pickupLogistics: true,
    payments: true,
    refunds: true,
    householdCredits: true,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: true,
    inbox: true,
    notifications: true,
    auditLog: true,
  },
  terms: {
    coach: { singular: "Instructor", plural: "Instructors", role: "Instructor" },
    student: { singular: "Kid", plural: "Kids" },
    member: { singular: "Family", plural: "Families" },
    household: { singular: "Family", plural: "Families" },
    parent: { singular: "Parent", plural: "Parents" },
    class: { singular: "Class", plural: "Classes" },
    privateLesson: { singular: "1:1 session", plural: "1:1 sessions" },
    program: { singular: "Program", plural: "Programs" },
    season: { singular: "Term", plural: "Terms" },
    enrollment: { singular: "Registration", plural: "Registrations" },
    level: { singular: "Group", plural: "Groups" },
    court: { singular: "Room", plural: "Rooms" },
    venue: { singular: "Site", plural: "Sites" },
    club: { singular: "Hub", plural: "Hubs" },
    bookVerb: "Schedule",
    enrollVerb: "Register",
    attendance: "Roll call",
    membership: { singular: "Plan", plural: "Plans" },
    classGroup: { singular: "Group", plural: "Groups" },
    ladder: { singular: "Ladder", plural: "Ladders" },
    match: { singular: "Game", plural: "Games" },
    school: { singular: "School", plural: "Schools" },
  },
};

// ─── Solo coach entrepreneur ───────────────────────────────────────────────
const SOLO_COACH: IndustryPreset = {
  slug: "solo_coach",
  label: "Solo coach / private practice",
  description:
    "One instructor (or a tiny team) running mostly one-to-one sessions plus the occasional small group. No memberships or member space booking — a lean lessons-and-billing surface.",
  productMode: "programs",
  features: {
    coaches: true,
    households: false,
    students: true,
    coachAvailability: true,
    coachPrivateLessonInvoicing: true,
    programs: false,
    seasons: false,
    classes: true,
    classSeries: true,
    events: false,
    levels: true,
    levelProgression: false,
    recurringBlocks: true,
    trialInterest: true,
    payments: true,
    refunds: true,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: true,
    inbox: true,
    notifications: true,
  },
  terms: {
    coach: { singular: "Coach", plural: "Coaches", role: "Coach" },
    student: { singular: "Client", plural: "Clients" },
    class: { singular: "Session", plural: "Sessions" },
    privateLesson: { singular: "1:1 session", plural: "1:1 sessions" },
    program: { singular: "Program", plural: "Programs" },
    season: { singular: "Block", plural: "Blocks" },
    enrollment: { singular: "Booking", plural: "Bookings" },
    level: { singular: "Level", plural: "Levels" },
    court: { singular: "Spot", plural: "Spots" },
    venue: { singular: "Location", plural: "Locations" },
    club: { singular: "Practice", plural: "Practices" },
    bookVerb: "Book",
    enrollVerb: "Sign up",
    attendance: "Attendance",
    membership: { singular: "Package", plural: "Packages" },
    household: { singular: "Household", plural: "Households" },
    parent: { singular: "Client", plural: "Clients" },
    member: { singular: "Client", plural: "Clients" },
    school: { singular: "Location", plural: "Locations" },
    classGroup: { singular: "Group", plural: "Groups" },
    ladder: { singular: "Ladder", plural: "Ladders" },
    match: { singular: "Meet", plural: "Meets" },
  },
};

// ─── Dance studio ──────────────────────────────────────────────────────────
const DANCE_STUDIO: IndustryPreset = {
  slug: "dance_studio",
  label: "Dance / yoga / fitness studio",
  description:
    "Drop-in style classes, multi-class packages, and stage labels (Beginner / Intermediate / Advanced). No member self-service space booking or ranked ladders; memberships unlock unlimited-style access.",
  productMode: "programs",
  features: {
    coaches: true,
    households: true,
    students: true,
    coachInvites: true,
    coachAvailability: true,
    coachSubs: true,
    coachPrivateLessonInvoicing: true,
    programs: true,
    seasons: true,
    classes: true,
    classSeries: true,
    classSubgroups: false,
    events: true,
    levels: true,
    recurringBlocks: true,
    trialInterest: true,
    classTransfers: true,
    venues: true,
    memberships: true,
    membershipCoverage: false,
    householdCredits: true,
    payments: true,
    refunds: true,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: true,
    inbox: true,
    notifications: true,
    auditLog: true,
  },
  terms: {
    coach: { singular: "Instructor", plural: "Instructors", role: "Instructor" },
    student: { singular: "Student", plural: "Students" },
    member: { singular: "Member", plural: "Members" },
    class: { singular: "Class", plural: "Classes" },
    privateLesson: { singular: "Private session", plural: "Private sessions" },
    program: { singular: "Style", plural: "Styles" },
    season: { singular: "Term", plural: "Terms" },
    enrollment: { singular: "Booking", plural: "Bookings" },
    level: { singular: "Level", plural: "Levels" },
    court: { singular: "Studio", plural: "Studios" },
    venue: { singular: "Location", plural: "Locations" },
    club: { singular: "Organization", plural: "Organizations" },
    bookVerb: "Book",
    enrollVerb: "Sign up",
    attendance: "Attendance",
    membership: { singular: "Membership", plural: "Memberships" },
    household: { singular: "Household", plural: "Households" },
    parent: { singular: "Parent", plural: "Parents" },
    school: { singular: "School", plural: "Schools" },
    classGroup: { singular: "Level group", plural: "Level groups" },
    ladder: { singular: "Ladder", plural: "Ladders" },
    match: { singular: "Showcase", plural: "Showcases" },
  },
};

// ─── Events-first society / promoter ───────────────────────────────────────
const EVENT_ORGANIZER: IndustryPreset = {
  slug: "event_organizer",
  label: "Events society / promoter",
  description:
    "Mostly one-off or short-run happenings: publish events, take registrations and payments, and run a member portal — without the recurring class grid or staff roster module. You still add Tracks (programs) and Locations (venues) as labels for where things run, even when you do not own the site. Turn on memberships, credits, or classes later if you grow into them.",
  productMode: "programs",
  features: {
    coaches: false,
    coachInvites: false,
    coachAvailability: false,
    coachSubs: false,
    coachPrivateLessonInvoicing: false,
    parentAlsoPlays: false,
    programs: true,
    seasons: false,
    classes: false,
    classSeries: false,
    classSubgroups: false,
    events: true,
    levels: false,
    levelProgression: false,
    recurringBlocks: false,
    trialInterest: true,
    classTransfers: false,
    venues: true,
    courts: false,
    courtBookings: false,
    multiClub: false,
    clubAccessControl: false,
    ladder: false,
    leagues: false,
    tournaments: false,
    memberships: false,
    membershipCoverage: false,
    householdCredits: false,
    payments: true,
    refunds: true,
    proShop: false,
    schoolPartnerships: false,
    pickupLogistics: false,
    volunteerDuty: false,
    knltbIntegration: false,
    googleCalendarFeeds: true,
    whatsappLinks: true,
    attendance: false,
    households: true,
    students: true,
    inbox: true,
    notifications: true,
    auditLog: true,
  },
  terms: {
    coach: { singular: "Host", plural: "Hosts", role: "Host" },
    class: { singular: "Event", plural: "Events" },
    program: { singular: "Track", plural: "Tracks" },
    enrollment: { singular: "Registration", plural: "Registrations" },
    student: { singular: "Participant", plural: "Participants" },
    member: { singular: "Member", plural: "Members" },
    household: { singular: "Household", plural: "Households" },
    parent: { singular: "Guardian", plural: "Guardians" },
    privateLesson: { singular: "Add-on session", plural: "Add-on sessions" },
    season: { singular: "Season", plural: "Seasons" },
    level: { singular: "Tier", plural: "Tiers" },
    classGroup: { singular: "Wave", plural: "Waves" },
    court: { singular: "Space", plural: "Spaces" },
    venue: { singular: "Location", plural: "Locations" },
    club: { singular: "Organizer", plural: "Organizers" },
    school: { singular: "Partner site", plural: "Partner sites" },
    ladder: { singular: "Ranking", plural: "Rankings" },
    match: { singular: "Fixture", plural: "Fixtures" },
    bookVerb: "Reserve",
    enrollVerb: "Register",
    attendance: "Check-in",
    membership: { singular: "Membership", plural: "Memberships" },
  },
};

// ─── Custom (start blank) ──────────────────────────────────────────────────
const CUSTOM: IndustryPreset = {
  slug: "custom",
  label: "Custom — start from a blank slate",
  description:
    "No assumptions. Every feature off (except Classes), default terminology. Pick this if none of the bundled presets quite fit you and you want to switch things on yourself.",
  productMode: "custom",
  features: {},
  terms: {},
};

export const INDUSTRY_PRESETS: ReadonlyArray<IndustryPreset> = [
  TENNIS_CLUB,
  MUSIC_SCHOOL,
  AFTER_SCHOOL,
  SOLO_COACH,
  DANCE_STUDIO,
  EVENT_ORGANIZER,
  CUSTOM,
] as const;

/** Look up a preset by slug. Returns the `custom` preset if not found. */
export function getPreset(slug: string | null | undefined): IndustryPreset {
  if (!slug) return CUSTOM;
  return INDUSTRY_PRESETS.find((p) => p.slug === slug) ?? CUSTOM;
}

/**
 * Resolve the full `(features, terms, productMode)` for a preset, with
 * baseline defaults filled in. Used by the org resolver and by the
 * "apply preset" admin action.
 */
export function resolvePreset(slug: string | null | undefined): {
  presetSlug: string;
  productMode: ProductMode;
  features: FeatureFlags;
  terms: Terms;
} {
  const preset = getPreset(slug);
  return {
    presetSlug: preset.slug,
    productMode: preset.productMode,
    features: { ...BASE_FEATURE_FLAGS, ...preset.features },
    terms: mergeTermsForPreset(preset.terms),
  };
}

function mergeTermsForPreset(overrides: TermsOverrides): Terms {
  // Cheap structured-clone of DEFAULT_TERMS, then overlay overrides.
  const out: Terms = JSON.parse(JSON.stringify(DEFAULT_TERMS)) as Terms;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      (out as unknown as Record<string, unknown>)[key] = value;
    } else if (typeof value === "object") {
      const target = (out as unknown as Record<string, Record<string, string>>)[key];
      if (target && typeof target === "object") {
        Object.assign(target, value);
      }
    }
  }
  return out;
}

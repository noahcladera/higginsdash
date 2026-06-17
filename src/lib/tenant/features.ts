/**
 * Feature flag catalogue.
 *
 * Every togglable surface in the app is listed here. The interface is a
 * flat record of booleans (so reading is `org.features.coaches` etc.); the
 * grouping below is purely for the admin UI ("Settings → Features"), which
 * lays them out in sections with descriptive copy.
 *
 * Adding a new gate:
 *   1. Add a key to `FeatureFlags` and a default value to `BASE_FEATURE_FLAGS`.
 *   2. Add a row to `FEATURE_FLAG_GROUPS` so admins can toggle it.
 *   3. (Optional) Call `requireFeature("yourFeature")` at the top of the
 *      page/layout/server-action that should 404 when it's off.
 *
 * Intentionally coarse — fine-grained ("show the KNLTB export button")
 * still belongs in code/local config, not here.
 */
export interface FeatureFlags {
  // ── People ─────────────────────────────────────────────────────────────────
  /** Staff directory, assignments, and scheduling surfaces for instructors. */
  coaches: boolean;
  /** Link people into shared accounts (e.g. one payer for several learners). Off for
   *  solo-adult-only orgs. */
  households: boolean;
  /** Track learners as a separate record from whoever pays or logs in. Off for
   *  adult-only orgs with nothing to enrol. */
  students: boolean;
  /** The same person can be both payer/guardian and enrolled as a learner. */
  parentAlsoPlays: boolean;
  /** Email invites to onboard new teaching staff. */
  coachInvites: boolean;
  /** Per-staff weekly availability used by scheduling. */
  coachAvailability: boolean;
  /** Staff request coverage when they cannot lead a session. */
  coachSubs: boolean;
  /** Payout or invoice workflow for private / small-group sessions. */
  coachPrivateLessonInvoicing: boolean;

  // ── Programs / Catalog ─────────────────────────────────────────────────────
  /** Top-level catalog tracks (e.g. youth vs adult, summer camp vs term classes). */
  programs: boolean;
  /** Time-bounded terms or enrollment windows (Spring 2026, Fall semester). */
  seasons: boolean;
  /** Schedulable offerings: group classes, lessons, sessions, camps. Almost always on. */
  classes: boolean;
  /** Recurring series (same offering week to week across a term). */
  classSeries: boolean;
  /** Named splits inside one timeslot (levels, sections) sharing space and instructor. */
  classSubgroups: boolean;
  /** One-off or short-run offerings (workshops, intensives, showcases). */
  events: boolean;
  /** Dedicated camp management surfaces with camp-specific options/pricing. */
  camps: boolean;
  /** Stage or difficulty metadata on offerings and learners. */
  levels: boolean;
  /** Structured progression and reviews on top of levels. */
  levelProgression: boolean;
  /** Repeating calendar holds (standing private slot, blocked room). */
  recurringBlocks: boolean;
  /** Public "I'm interested" form for prospects who are not ready to enrol. */
  trialInterest: boolean;
  /** Learners request to move between offerings; admins approve. */
  classTransfers: boolean;

  // ── Spaces / Scheduling ────────────────────────────────────────────────────
  /** Physical sites where sessions run. */
  venues: boolean;
  /** Bookable units inside a site (studios, rooms, courts, lanes). */
  courts: boolean;
  /** Members reserve space for their own use outside class enrollment. */
  courtBookings: boolean;
  /** Multiple branches or brands under one tenant. */
  multiClub: boolean;
  /** Per-site access rules when benefits differ by location. */
  clubAccessControl: boolean;

  // ── Memberships / Billing ──────────────────────────────────────────────────
  /** Recurring passes or plans with member-only pricing. */
  memberships: boolean;
  /** Plans cover different sites or catalogs. */
  membershipCoverage: boolean;
  /** Per-household stored credit / wallet. */
  householdCredits: boolean;
  /** Collect payments for enrolments, sessions, and plans. Off for free orgs. */
  payments: boolean;
  /** Refund / cancellation workflow for past payments. */
  refunds: boolean;

  // ── Delivery models ────────────────────────────────────────────────────────
  /** Programs delivered at partner schools or third-party sites. */
  schoolPartnerships: boolean;
  /** Collect learners at a school and bring them to your site. */
  pickupLogistics: boolean;

  // ── Integrations ───────────────────────────────────────────────────────────
  googleCalendarFeeds: boolean;
  /** WhatsApp links on series or term pages. */
  whatsappLinks: boolean;

  // ── Ops ────────────────────────────────────────────────────────────────────
  /** Record who attended each session. */
  attendance: boolean;
  /** Internal inbox for admins. */
  inbox: boolean;
  /** Email and push notifications. */
  notifications: boolean;
  /** Admin audit log. */
  auditLog: boolean;
}

/**
 * The "everything off" baseline. Presets layer on top of this, then per-org
 * overrides layer on top of the preset. Anything not mentioned by a preset
 * inherits the baseline value below.
 *
 * Almost every flag defaults to false — a tenant should only get a feature
 * after their preset (or a manual toggle) has explicitly turned it on. The
 * one exception is `classes`, since all five bundled presets include classes
 * and a tenant with `classes: false` is essentially "just a CRM".
 */
export const BASE_FEATURE_FLAGS: FeatureFlags = {
  // People
  coaches: false,
  households: false,
  students: false,
  parentAlsoPlays: false,
  coachInvites: false,
  coachAvailability: false,
  coachSubs: false,
  coachPrivateLessonInvoicing: false,
  // Programs
  programs: false,
  seasons: false,
  classes: true,
  classSeries: false,
  classSubgroups: false,
  events: false,
  camps: false,
  levels: false,
  levelProgression: false,
  recurringBlocks: false,
  trialInterest: false,
  classTransfers: false,
  // Spaces
  venues: false,
  courts: false,
  courtBookings: false,
  multiClub: false,
  clubAccessControl: false,
  // Billing
  memberships: false,
  membershipCoverage: false,
  householdCredits: false,
  payments: false,
  refunds: false,
  // Delivery
  schoolPartnerships: false,
  pickupLogistics: false,
  // Integrations
  googleCalendarFeeds: false,
  whatsappLinks: false,
  // Ops
  attendance: false,
  inbox: false,
  notifications: false,
  auditLog: false,
};

/** Section heading on the admin "Features" screen. */
export interface FeatureFlagGroup {
  id: string;
  label: string;
  description: string;
  flags: ReadonlyArray<FeatureFlagDescriptor>;
}

export interface FeatureFlagDescriptor {
  key: keyof FeatureFlags;
  label: string;
  /** One-sentence "what does this do, in plain language" copy. */
  description: string;
  /** When false, the admin UI shows this flag in a disabled state with a
   *  tooltip saying which other flag has to be on first. */
  requires?: ReadonlyArray<keyof FeatureFlags>;
}

/**
 * Admin-UI grouping. The order here is the order shown on the Features
 * settings page; each group renders as a labelled card.
 */
export const FEATURE_FLAG_GROUPS: ReadonlyArray<FeatureFlagGroup> = [
  {
    id: "people",
    label: "People",
    description:
      "Staff, households, learners, and how accounts relate to who shows up in sessions.",
    flags: [
      {
        key: "coaches",
        label: "Teaching staff (coaches / instructors)",
        description:
          "Show staff profiles and assign them to offerings. Turn off for solo operators who never delegate.",
      },
      {
        key: "households",
        label: "Households",
        description:
          "Link people into shared accounts (e.g. one guardian paying for several learners). Turn off for adult-only orgs where everyone books as an individual.",
      },
      {
        key: "students",
        label: "Learners (students)",
        description:
          "Track learners as their own record separate from whoever pays or logs in. Turn off if you only sell open adult drop-in with no named roster.",
      },
      {
        key: "parentAlsoPlays",
        label: "Guardian is also a learner",
        description:
          "The same person can be both payer or guardian and enrolled in offerings (e.g. a parent in a beginners group alongside a child).",
        requires: ["households"],
      },
      {
        key: "coachInvites",
        label: "Staff invites (email)",
        description:
          "Invite new instructors or teachers by email. Turn off if you only add staff manually in admin.",
        requires: ["coaches"],
      },
      {
        key: "coachAvailability",
        label: "Staff availability",
        description:
          "Each staff member maintains a weekly availability pattern that scheduling can read.",
        requires: ["coaches"],
      },
      {
        key: "coachSubs",
        label: "Cover / substitute requests",
        description:
          "Staff can request another instructor to cover a session they cannot lead.",
        requires: ["coaches"],
      },
      {
        key: "coachPrivateLessonInvoicing",
        label: "Private session invoicing",
        description:
          "Generate periodic payouts or reimbursements for one-to-one or small private sessions.",
        requires: ["coaches", "payments"],
      },
    ],
  },
  {
    id: "programs",
    label: "Programs & catalog",
    description:
      "What you offer: catalog structure, terms, recurring enrolments, and one-offs.",
    flags: [
      {
        key: "programs",
        label: "Programs",
        description:
          'Top-level tracks (e.g. youth cohort, adult evening, weekend intensive). Turn off if you truly only run a single undifferentiated schedule.',
      },
      {
        key: "seasons",
        label: "Seasons / terms",
        description:
          "Time-bounded windows (Spring 2026, Fall semester). Turn off if you run year-round with no term boundaries.",
      },
      {
        key: "classes",
        label: "Classes / sessions",
        description:
          "The schedulable offerings most tenants use: group classes, lessons, sessions, camps.",
      },
      {
        key: "classSeries",
        label: "Recurring series",
        description:
          "An offering that repeats on a weekly pattern across a term or season. Turn off if every session is standalone.",
        requires: ["classes"],
      },
      {
        key: "classSubgroups",
        label: "Subgroups inside a timeslot",
        description:
          "Split one timeslot into named sections (e.g. A/B levels) sharing the same space and instructor.",
        requires: ["classes"],
      },
      {
        key: "events",
        label: "Events",
        description:
          "Single-session or short-run workshops, showcases, open days, or trips — anything that does not use the weekly series pattern.",
      },
      {
        key: "camps",
        label: "Camps",
        description:
          "Dedicated camp flows (half/full-week and optional daily drop-in options) under their own admin surface.",
        requires: ["classes"],
      },
      {
        key: "levels",
        label: "Levels / stages",
        description:
          "Difficulty or stage labels on offerings and learners (beginner, intermediate, belt rank, etc.).",
      },
      {
        key: "levelProgression",
        label: "Structured progression",
        description:
          "Instructors review learners against criteria and move them to the next stage. Requires levels.",
        requires: ["levels"],
      },
      {
        key: "recurringBlocks",
        label: "Recurring calendar blocks",
        description:
          "Reserve repeating blocks (standing private slot, staff meeting, room on hold).",
      },
      {
        key: "trialInterest",
        label: "Trial / interest form",
        description:
          'Public "I\'m interested" form for prospects who are not ready to enrol yet.',
      },
      {
        key: "classTransfers",
        label: "Offering transfer requests",
        description:
          "Learners can request to switch from one offering to another; admins approve.",
        requires: ["classes"],
      },
    ],
  },
  {
    id: "spaces",
    label: "Spaces & scheduling",
    description:
      "Where sessions happen — sites, bookable spaces, and optional self-service booking.",
    flags: [
      {
        key: "venues",
        label: "Sites / venues",
        description:
          "Physical addresses or named locations where offerings run. Turn off if you never need to distinguish sites.",
      },
      {
        key: "courts",
        label: "Bookable spaces",
        description:
          "Studios, rooms, courts, lanes — the unit you assign to sessions and private bookings.",
        requires: ["venues"],
      },
      {
        key: "courtBookings",
        label: "Member space booking",
        description:
          "Let members reserve a space for their own practice or play, separate from class enrolment.",
        requires: ["courts"],
      },
      {
        key: "multiClub",
        label: "Multiple branches or brands",
        description:
          "Run more than one branded site or branch under the same tenant. Turn off for single-location orgs.",
      },
      {
        key: "clubAccessControl",
        label: "Per-site access rules",
        description:
          "Gate enrolments or space use by branch when plans or benefits differ per location.",
        requires: ["multiClub", "memberships"],
      },
    ],
  },
  {
    id: "billing",
    label: "Memberships & billing",
    description: "Plans, payments, credits, and retail at the desk or online.",
    flags: [
      {
        key: "memberships",
        label: "Paid memberships / passes",
        description:
          "Recurring plans with member-only pricing or access. Turn off if everything is pay-per-session.",
      },
      {
        key: "membershipCoverage",
        label: "Plan coverage by site or catalog",
        description:
          "Different bundles cover different sites, branches, or groups of offerings.",
        requires: ["memberships"],
      },
      {
        key: "householdCredits",
        label: "Household credit wallets",
        description:
          "A stored balance per household spent on enrolments and refilled on top-up.",
      },
      {
        key: "payments",
        label: "Payments",
        description:
          "Charge for enrolments, sessions, and plans. Off for free or invoice-only orgs.",
      },
      {
        key: "refunds",
        label: "Refunds",
        description:
          "Workflow for refunding past payments and handling cancellations.",
        requires: ["payments"],
      },
    ],
  },
  {
    id: "delivery",
    label: "Delivery models",
    description:
      "Partner-site delivery, transport between sites, and volunteer-run operations.",
    flags: [
      {
        key: "schoolPartnerships",
        label: "Partner-school delivery",
        description:
          "Run offerings at partner schools or third-party sites instead of only at your main location.",
      },
      {
        key: "pickupLogistics",
        label: "Pickup / shuttle logistics",
        description:
          "Collect learners at one site (e.g. a school) and bring them to your main location for sessions.",
        requires: ["schoolPartnerships"],
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "External calendars, chat links, and optional federation data.",
    flags: [
      {
        key: "googleCalendarFeeds",
        label: "Calendar subscription feeds",
        description:
          "Personal iCal URLs participants can add to Google Calendar, Apple Calendar, or similar.",
      },
      {
        key: "whatsappLinks",
        label: "WhatsApp group links",
        description:
          "Show WhatsApp invite links on series or term pages so groups can coordinate outside email.",
      },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    description: "Day-to-day tools for staff and compliance.",
    flags: [
      {
        key: "attendance",
        label: "Attendance",
        description:
          "Instructors or admins record who attended each session.",
        requires: ["classes"],
      },
      {
        key: "inbox",
        label: "Admin inbox",
        description:
          "A single feed of messages, requests, and follow-ups for admins to work through.",
      },
      {
        key: "notifications",
        label: "Notifications",
        description: "Email and push notifications to participants and staff.",
      },
      {
        key: "auditLog",
        label: "Audit log",
        description: "Who changed what, with timestamps. Useful for compliance.",
      },
    ],
  },
] as const;

/** All FeatureFlag keys, in declaration order. */
export const FEATURE_FLAG_KEYS: ReadonlyArray<keyof FeatureFlags> =
  Object.keys(BASE_FEATURE_FLAGS) as Array<keyof FeatureFlags>;

/**
 * Merge a (possibly partial) override on top of `BASE_FEATURE_FLAGS`. Used
 * by presets and the org resolver — silently ignores unknown keys so an
 * old DB row with a since-removed flag doesn't crash the app.
 */
export function mergeFeatureFlags(
  base: FeatureFlags,
  overrides: Partial<FeatureFlags> | null | undefined,
): FeatureFlags {
  if (!overrides) return base;
  const out: FeatureFlags = { ...base };
  for (const key of FEATURE_FLAG_KEYS) {
    const value = overrides[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * Coerce a JSON value coming back from the database into a partial
 * FeatureFlags. Drops anything that isn't a boolean or whose key isn't a
 * known flag — keeps the application strongly typed even though the column
 * is `Json`.
 */
export function parseFeatureFlagsJson(
  value: unknown,
): Partial<FeatureFlags> {
  if (!value || typeof value !== "object") return {};
  const out: Partial<FeatureFlags> = {};
  const record = value as Record<string, unknown>;
  for (const key of FEATURE_FLAG_KEYS) {
    const v = record[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

/**
 * Whether the lesson is a youth pickup class. This drives location/
 * program defaults (pickup time, canonical kids-group program) but
 * does NOT by itself toggle the multi-group UI — the admin opts into
 * groups explicitly via the "Split into groups" step.
 */
export function isYouthPickupLesson(args: {
  audience: "adult" | "youth" | "kids" | "adults" | "mixed";
  deliveryMode: "at_club" | "onsite" | "pickup";
}): boolean {
  const isYouth = args.audience === "youth" || args.audience === "kids";
  return isYouth && args.deliveryMode === "pickup";
}

/**
 * Whether to render the multi-group UI (lead + assistants, per-group
 * coaches, derived roster caps). Only youth pickup classes can opt in,
 * and the admin must explicitly choose to split into multiple groups —
 * default flow is the simple single-group lesson.
 */
export function useSplitGroupsLesson(args: {
  youthPickup: boolean;
  splitIntoGroups: boolean;
}): boolean {
  return args.youthPickup && args.splitIntoGroups;
}

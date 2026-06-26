import type { ClassType } from "@prisma/client";

import { cn } from "@/lib/utils";

const PRIVATE_CLASS_TYPES: ClassType[] = [
  "private_individual",
  "private_small_group",
];

type ClassDeliveryArgs = {
  deliveryMode: "at_club" | "onsite" | "pickup";
  classType: ClassType;
};

/** Soft background fill by club venue (admin week calendar). */
export function clubVenueFillClasses(clubSlug: string | null): string {
  if (clubSlug === "triaz") return "bg-[var(--triaz-soft)]";
  if (clubSlug === "randwijck") return "bg-[var(--randwijck-soft)]";
  return "bg-[var(--surface-strong)]";
}

/** Left accent bar encoding club venue on delivery-colored blocks. */
export function clubVenueAccentClasses(clubSlug: string | null): string {
  if (clubSlug === "triaz") return "border-l-[3px] border-l-[var(--triaz)]";
  if (clubSlug === "randwijck")
    return "border-l-[3px] border-l-[var(--randwijck)]";
  return "border-l-[3px] border-l-[var(--joint)]";
}

/** Delivery category fill (not club brand — uses --delivery-* tokens). */
function deliveryFillClasses(kind: "pickup" | "onsite" | "private" | "at_club") {
  const map = {
    pickup: "bg-[var(--delivery-pickup-soft)] text-[var(--delivery-pickup-ink)]",
    onsite: "bg-[var(--delivery-onsite-soft)] text-[var(--delivery-onsite-ink)]",
    private:
      "bg-[var(--delivery-private-soft)] text-[var(--delivery-private-ink)]",
    at_club:
      "bg-[var(--delivery-at-club-soft)] text-[var(--delivery-at-club-ink)]",
  } as const;
  return map[kind];
}

function deliveryBorderClasses(
  kind: "pickup" | "onsite" | "private" | "at_club",
) {
  const map = {
    pickup: "border border-[var(--delivery-pickup)]/50",
    onsite: "border border-[var(--delivery-onsite)]/50",
    private: "border border-[var(--delivery-private)]/50",
    at_club: "border border-[var(--delivery-at-club)]/50",
  } as const;
  return map[kind];
}

function deliveryKind(args: ClassDeliveryArgs): "pickup" | "onsite" | "private" | "at_club" {
  if (PRIVATE_CLASS_TYPES.includes(args.classType)) return "private";
  if (args.deliveryMode === "pickup") return "pickup";
  if (args.deliveryMode === "onsite") return "onsite";
  return "at_club";
}

/** Thin border encoding how the class is delivered. */
export function classDeliveryBorderClasses(args: ClassDeliveryArgs): string {
  return deliveryBorderClasses(deliveryKind(args));
}

/** Fill + border for admin dashboard week calendar blocks. */
export function adminCalendarBlockClasses(args: {
  clubSlug: string | null;
  deliveryMode: "at_club" | "onsite" | "pickup";
  classType: ClassType;
}): string {
  return cn(
    clubVenueFillClasses(args.clubSlug),
    classDeliveryBorderClasses(args),
  );
}

/** Colored fill for court schedule grid (delivery type, not club). */
function classDeliveryCourtFillClasses(args: ClassDeliveryArgs): string {
  return deliveryFillClasses(deliveryKind(args));
}

/** Tailwind classes for class blocks on the court schedule grid. */
export function classSlotColorClasses(args: ClassDeliveryArgs): string {
  return cn(
    classDeliveryBorderClasses(args),
    classDeliveryCourtFillClasses(args),
  );
}

function deliveryAccentBar(
  kind: "pickup" | "onsite" | "private" | "at_club",
): string {
  const map = {
    pickup: "border-l-[3px] border-l-[var(--delivery-pickup)]",
    onsite: "border-l-[3px] border-l-[var(--delivery-onsite)]",
    private: "border-l-[3px] border-l-[var(--delivery-private)]",
    at_club: "border-l-[3px] border-l-[var(--delivery-at-club)]",
  } as const;
  return map[kind];
}

/** Restrained admin week grid — delivery type via accent bar, not flood fill. */
export function adminCompactClassSlotClasses(args: ClassDeliveryArgs): string {
  return cn(
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]",
    deliveryAccentBar(deliveryKind(args)),
  );
}

/** Hide horizontal seams between merged admin-compact class rows. */
export function adminCompactClassMergeBorderClasses(args: {
  continuesFromAbove?: boolean;
  continuesToBelow?: boolean;
}): string {
  return cn(
    args.continuesFromAbove && "border-t-[var(--surface)]",
    args.continuesToBelow && "border-b-[var(--surface)]",
  );
}

/** Restrained booking blocks for admin week grid. */
export function adminCompactBookingSlotClasses(args: {
  purpose: string;
  status: string;
  isOwn: boolean;
}): string {
  const base =
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";
  if (args.status === "cancellation_requested") {
    return cn(base, "border-l-[3px] border-l-[var(--warning)]");
  }
  if (args.purpose === "coaching") {
    return cn(base, "border-l-[3px] border-l-[var(--delivery-private)]");
  }
  if (args.isOwn) {
    return cn(base, "border-l-[3px] border-l-[var(--success)]");
  }
  return cn(base, "border-l-[3px] border-l-[var(--delivery-onsite)]");
}

/** Legend chip matching admin-compact accent-bar encoding. */
export function adminCompactLegendAccent(
  kind: "pickup" | "onsite" | "private" | "at_club" | "success" | "warning",
): string {
  const map = {
    pickup: "border-l-[3px] border-l-[var(--delivery-pickup)]",
    onsite: "border-l-[3px] border-l-[var(--delivery-onsite)]",
    private: "border-l-[3px] border-l-[var(--delivery-private)]",
    at_club: "border-l-[3px] border-l-[var(--delivery-at-club)]",
    success: "border-l-[3px] border-l-[var(--success)]",
    warning: "border-l-[3px] border-l-[var(--warning)]",
  } as const;
  return cn("border border-[var(--border)] bg-[var(--surface)]", map[kind]);
}

/** Hide horizontal seams when consecutive rows share one class session. */
export function classSlotMergeBorderClasses(
  args: ClassDeliveryArgs & {
    continuesFromAbove?: boolean;
    continuesToBelow?: boolean;
    isMember?: boolean;
  },
): string {
  if (args.isMember) {
    return cn(
      args.continuesFromAbove && "border-t-[var(--surface-strong)]",
      args.continuesToBelow && "border-b-[var(--surface-strong)]",
    );
  }
  const kind = deliveryKind(args);
  const top = {
    pickup: "border-t-[var(--delivery-pickup-soft)]",
    onsite: "border-t-[var(--delivery-onsite-soft)]",
    private: "border-t-[var(--delivery-private-soft)]",
    at_club: "border-t-[var(--delivery-at-club-soft)]",
  } as const;
  const bottom = {
    pickup: "border-b-[var(--delivery-pickup-soft)]",
    onsite: "border-b-[var(--delivery-onsite-soft)]",
    private: "border-b-[var(--delivery-private-soft)]",
    at_club: "border-b-[var(--delivery-at-club-soft)]",
  } as const;
  return cn(
    args.continuesFromAbove && top[kind],
    args.continuesToBelow && bottom[kind],
  );
}

/** Tailwind classes for booking blocks on the court schedule grid. */
export function bookingSlotColorClasses(args: {
  purpose: string;
  status: string;
  isOwn: boolean;
}): string {
  if (args.status === "cancellation_requested") {
    return "border border-[var(--warning)]/50 bg-[var(--warning-soft)] text-[var(--warning-ink)]";
  }
  if (args.purpose === "coaching") {
    return cn(
      deliveryBorderClasses("private"),
      deliveryFillClasses("private"),
    );
  }
  if (args.isOwn) {
    return cn(
      "border border-[var(--success)]/50",
      "bg-[var(--success-soft)] text-[var(--success-ink)]",
    );
  }
  return cn(
    deliveryBorderClasses("onsite"),
    deliveryFillClasses("onsite"),
  );
}

/** Coach / member calendar block: delivery semantics + venue accent. */
export function coachSessionBlockClasses(args: {
  deliveryMode: "at_club" | "onsite" | "pickup";
  clubSlug: string | null;
}): string {
  if (args.deliveryMode === "pickup") {
    return cn(
      deliveryFillClasses("pickup"),
      deliveryBorderClasses("pickup"),
      clubVenueAccentClasses(args.clubSlug),
    );
  }
  if (args.deliveryMode === "onsite") {
    return cn(
      deliveryFillClasses("onsite"),
      deliveryBorderClasses("onsite"),
      clubVenueAccentClasses(args.clubSlug),
    );
  }
  return cn(
    clubVenueFillClasses(args.clubSlug),
    deliveryBorderClasses("at_club"),
  );
}

export function scheduleClassCategoryLabel(args: ClassDeliveryArgs): string {
  if (PRIVATE_CLASS_TYPES.includes(args.classType)) return "Private lesson";
  if (args.deliveryMode === "pickup") return "Pickup lesson";
  if (args.deliveryMode === "onsite") return "On-site lesson";
  return "At club lesson";
}

/** Greyed-out reserved blocks on the member court booking grid. */
export function memberReservedSlotClasses(): string {
  return "border border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]";
}

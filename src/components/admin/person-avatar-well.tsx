import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-[var(--surface-strong)] text-[var(--foreground)]",
  triaz: "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]",
  randwijck: "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]",
  joint: "bg-[var(--joint-soft)] text-[var(--joint-ink)]",
  success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
};

export function personInitials(firstName: string, lastName: string): string {
  const f = firstName.trim().charAt(0).toUpperCase();
  const l = lastName.trim().charAt(0).toUpperCase();
  if (f && l) return `${f}${l}`;
  if (f) return f;
  if (l) return l;
  return "?";
}

export function PersonAvatarWell({
  firstName,
  lastName,
  tone = "neutral",
  size = "md",
  className,
}: {
  firstName: string;
  lastName: string;
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const initials = personInitials(firstName, lastName);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold control-well",
        size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

/** Derive avatar tone from a person's primary roles. */
export function personAvatarTone(args: {
  isAdmin?: boolean;
  isCoach?: boolean;
  isStudent?: boolean;
}): StatusTone {
  if (args.isAdmin) return "neutral";
  if (args.isCoach) return "joint";
  if (args.isStudent) return "triaz";
  return "neutral";
}

/** Parse "First Last" or single token name into initials parts. */
export function personAvatarFromFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

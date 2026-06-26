import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type MaterialTileTone =
  | "neutral"
  | "triaz"
  | "randwijck"
  | "joint"
  | "primary";

const TONE_SHELL: Record<MaterialTileTone, string> = {
  neutral: "elev-card",
  primary: "elev-card border-[var(--triaz)]/35 ring-1 ring-[var(--triaz)]/15",
  triaz: "elev-card elev-card-accent-triaz bg-[var(--triaz-soft)]/40",
  randwijck: "elev-card elev-card-accent-randwijck bg-[var(--randwijck-soft)]/40",
  joint: "elev-card elev-card-accent-joint bg-[var(--joint-soft)]/40",
};

const INTERACTIVE =
  "transition-all duration-[var(--duration-base)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-floating)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

export interface MaterialTileProps {
  tone?: MaterialTileTone;
  href?: string;
  locked?: boolean;
  image?: React.ReactNode;
  imageFooter?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler;
}

/**
 * MaterialTile — Liquid Paper marketing / wizard surface.
 * Composes elev-card, optional tone glow, image header, glass footer overlay.
 */
export function MaterialTile({
  tone = "neutral",
  href,
  locked = false,
  image,
  imageFooter,
  className,
  children,
  onClick,
}: MaterialTileProps) {
  const shell = cn(
    "group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] text-left",
    TONE_SHELL[tone],
    !locked && INTERACTIVE,
    locked && "cursor-not-allowed select-none opacity-60",
    className,
  );

  const inner = (
    <>
      {image}
      {imageFooter}
      <div className={cn(image ? "p-5 sm:p-6" : "p-5 sm:p-6")}>{children}</div>
    </>
  );

  if (locked || !href) {
    return (
      <div className={shell} onClick={locked ? undefined : onClick}>
        {inner}
      </div>
    );
  }

  return (
    <Link href={href} className={shell} onClick={onClick}>
      {inner}
    </Link>
  );
}

/** Gradient overlay for image footers on hero program tiles. */
export function MaterialTileImageFooter({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--card)] via-[var(--card)]/85 to-transparent px-5 pb-4 pt-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildMailtoLink,
  buildWhatsAppLink,
} from "@/lib/contacts/phone";
import type {
  ContactTarget,
  PersonContactGroup,
} from "@/lib/contacts/queries";

/**
 * Inline action cluster that lets a coach or admin reach out to the
 * people associated with a roster row in one tap. Renders two anchor
 * buttons (WhatsApp + Email) with these rules:
 *
 *   - When there's exactly one viable target for that channel, the
 *     anchor links straight to the deep link (`wa.me/...` /
 *     `mailto:...`). One tap, one chat.
 *   - When there are multiple targets (e.g. mom and dad), the click
 *     opens a small picker so the user can decide which contact to
 *     open.
 *   - Channels with no viable target render a disabled stub with a
 *     hover hint ("No phone on file") so the affordance is consistent
 *     across rows.
 *
 * The pre-filled WhatsApp body is generated from {@link subjectName}
 * and stays anonymous on purpose ("Hi, {brandName} here re: Emma"), so
 * the link works the same whether the office, a coach, or an admin
 * opens it. Customise via {@link prefillTemplate} when context calls
 * for it (e.g. an attendance follow-up).
 *
 * Keep the surface dense — most of these are mounted inside table rows.
 */

export type ContactSize = "xs" | "sm";

interface ContactButtonProps {
  /** Pre-resolved targets from `getStudentContacts` / `getPersonContacts`. */
  group: PersonContactGroup;
  /** Person whose row this button belongs to (used in fallback labels). */
  subjectName?: string;
  /**
   * Tenant short brand name. Used in the WhatsApp prefill body and
   * email subject when the caller doesn't override them. Server-passed
   * (from `getCurrentBrand()`) so the message says "Higgins" / "AICS"
   * / "Music Academy" depending on who's running this app.
   */
  brandName: string;
  /**
   * Custom WhatsApp body. Receives the subject name + target so the
   * caller can tailor the message. Defaults to a "Hi, {brandName} here
   * re: {subject}" line.
   */
  prefillTemplate?: (ctx: {
    subjectName: string;
    target: ContactTarget;
  }) => string;
  /** Email subject line — applied uniformly across targets. */
  emailSubject?: string;
  size?: ContactSize;
  /** Hide channels with no viable targets entirely. */
  hideUnavailable?: boolean;
  className?: string;
}

const sizeClasses: Record<ContactSize, string> = {
  xs: "h-7 px-2 text-[11px]",
  sm: "h-8 px-2.5 text-xs",
};

const baseButton =
  "inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

function makeDefaultPrefill(brandName: string) {
  return ({ subjectName }: { subjectName: string; target: ContactTarget }) =>
    `Hi, ${brandName} here re: ${subjectName}.`;
}

/**
 * Pair of icon-only buttons. Each renders a popover when there are
 * multiple targets for that channel.
 */
export function ContactButton({
  group,
  subjectName,
  brandName,
  prefillTemplate,
  emailSubject,
  size = "sm",
  hideUnavailable = false,
  className,
}: ContactButtonProps) {
  const subject = subjectName || group.subjectName || group.personLabel;
  const prefill = prefillTemplate ?? makeDefaultPrefill(brandName);

  const phoneTargets = group.targets.filter((t) =>
    Boolean(buildWhatsAppLink(t.phone)),
  );
  const emailTargets = group.targets.filter((t) =>
    Boolean(buildMailtoLink(t.email)),
  );

  const showWhatsapp = !hideUnavailable || phoneTargets.length > 0;
  const showEmail = !hideUnavailable || emailTargets.length > 0;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {showWhatsapp && (
        <ChannelControl
          channel="whatsapp"
          size={size}
          targets={phoneTargets}
          subjectName={subject}
          buildHref={(t) => buildWhatsAppLink(t.phone, prefill({ subjectName: subject, target: t }))}
          emptyHint="No phone on file"
        />
      )}
      {showEmail && (
        <ChannelControl
          channel="email"
          size={size}
          targets={emailTargets}
          subjectName={subject}
          buildHref={(t) =>
            buildMailtoLink(t.email, {
              subject:
                emailSubject ??
                `${brandName} · ${subject}`,
            })
          }
          emptyHint="No email on file"
        />
      )}
    </div>
  );
}

interface ChannelControlProps {
  channel: "whatsapp" | "email";
  targets: ContactTarget[];
  subjectName: string;
  buildHref: (t: ContactTarget) => string | null;
  size: ContactSize;
  emptyHint: string;
}

function ChannelControl({
  channel,
  targets,
  buildHref,
  size,
  emptyHint,
}: ChannelControlProps) {
  // Disabled stub when there's nobody to ping on this channel.
  if (targets.length === 0) {
    return (
      <button
        type="button"
        disabled
        title={emptyHint}
        aria-label={emptyHint}
        className={cn(baseButton, sizeClasses[size])}
      >
        <ChannelIcon channel={channel} />
      </button>
    );
  }

  // Single target → anchor straight to the deep link, no popover.
  if (targets.length === 1) {
    const t = targets[0];
    const href = buildHref(t);
    if (!href) {
      return (
        <button
          type="button"
          disabled
          title={emptyHint}
          aria-label={emptyHint}
          className={cn(baseButton, sizeClasses[size])}
        >
          <ChannelIcon channel={channel} />
        </button>
      );
    }
    return (
      <a
        href={href}
        target={channel === "whatsapp" ? "_blank" : undefined}
        rel={channel === "whatsapp" ? "noopener noreferrer" : undefined}
        title={`${channel === "whatsapp" ? "WhatsApp" : "Email"} ${t.label}`}
        aria-label={`${channel === "whatsapp" ? "WhatsApp" : "Email"} ${t.label}`}
        className={cn(baseButton, sizeClasses[size])}
      >
        <ChannelIcon channel={channel} />
      </a>
    );
  }

  // Multiple targets → show a picker.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={
          channel === "whatsapp"
            ? `WhatsApp — pick contact (${targets.length})`
            : `Email — pick contact (${targets.length})`
        }
        aria-label={
          channel === "whatsapp"
            ? `WhatsApp — pick contact (${targets.length} options)`
            : `Email — pick contact (${targets.length} options)`
        }
        className={cn(baseButton, sizeClasses[size])}
      >
        <ChannelIcon channel={channel} />
        <span className="text-[10px] tabular-nums opacity-70">
          {targets.length}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {channel === "whatsapp" ? "WhatsApp" : "Email"} who?
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((t, idx) => {
          const href = buildHref(t);
          const node = (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium leading-none">{t.label}</span>
              {t.description && (
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {t.description}
                </span>
              )}
            </div>
          );
          return (
            <DropdownMenuItem asChild key={`${t.key}-${idx}`}>
              {href ? (
                <a
                  href={href}
                  target={channel === "whatsapp" ? "_blank" : undefined}
                  rel={
                    channel === "whatsapp"
                      ? "noopener noreferrer"
                      : undefined
                  }
                  className="cursor-pointer"
                >
                  {node}
                </a>
              ) : (
                <span className="opacity-50">{node}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Inline SVG glyphs for the two channels — bundling them avoids a
 * dependency on lucide-react versions that may not have these brand
 * icons stabilised. Kept tiny and currentColor so the buttons inherit
 * tone from their parent.
 */
function ChannelIcon({ channel }: { channel: "whatsapp" | "email" }) {
  if (channel === "whatsapp") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={14}
        height={14}
        fill="currentColor"
        aria-hidden
      >
        <path d="M19.05 4.91A10 10 0 0 0 12 2C6.5 2 2 6.5 2 12c0 1.76.46 3.45 1.34 4.95L2 22l5.18-1.36A9.94 9.94 0 0 0 12 22c5.5 0 10-4.5 10-10 0-2.67-1.04-5.18-2.95-7.09zM12 20.18a8.16 8.16 0 0 1-4.16-1.13l-.3-.18-3.07.81.82-3-.2-.31A8.18 8.18 0 1 1 20.18 12c0 4.51-3.67 8.18-8.18 8.18zm4.7-6.13c-.26-.13-1.52-.75-1.76-.84-.24-.09-.4-.13-.58.13-.17.26-.66.84-.81 1.01-.15.17-.3.19-.55.06-.26-.13-1.07-.39-2.04-1.25a7.59 7.59 0 0 1-1.4-1.74c-.15-.26-.02-.4.11-.53.11-.11.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.79-1.92-.21-.5-.42-.43-.58-.44h-.5c-.17 0-.45.06-.69.32s-.91.89-.91 2.16c0 1.27.93 2.5 1.06 2.67.13.17 1.83 2.79 4.43 3.91 1.55.67 2.16.73 2.93.61.47-.07 1.52-.62 1.74-1.22.21-.6.21-1.11.15-1.22-.06-.11-.24-.17-.5-.3z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

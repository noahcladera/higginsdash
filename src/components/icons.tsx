import * as React from "react";

/*
 * Tiny line-icon set used by nav, empty states and inline labels.
 * Stroke-based, 1.6px, no fills — matches the editorial look of the
 * portal. Add new icons here so they share a consistent feel.
 */

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function base(p: IconProps) {
  const { size = 18, ...rest } = p;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 100-4V8z" />
    </svg>
  );
}

export function MembershipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 7l7-3 7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}

export function FamilyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="2.5" />
      <circle cx="16" cy="8" r="2.5" />
      <path d="M3 19c.8-3 3-4.5 5-4.5s4.2 1.5 5 4.5" />
      <path d="M11 19c.8-3 3-4.5 5-4.5s4.2 1.5 5 4.5" />
    </svg>
  );
}

/** Roster / group — two figures. */
export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="7" r="2.5" />
      <circle cx="16" cy="7" r="2.5" />
      <path d="M3 19c.8-2.5 2.5-4 5-4s4.2 1.5 5 4" />
      <path d="M11 19c.8-2.5 2.5-4 5-4s4.2 1.5 5 4" />
    </svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

export function ClassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6l8-3 8 3-8 3-8-3z" />
      <path d="M4 6v6c0 2 4 4 8 4s8-2 8-4V6" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function EllipsisVerticalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function TennisIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9c4 1 9.5 1 17 0M3.5 15c4-1 9.5-1 17 0" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 4h8v5a4 4 0 11-8 0V4z" />
      <path d="M5 5h3v3a3 3 0 01-3-3zM19 5h-3v3a3 3 0 003-3z" />
      <path d="M10 14v2a2 2 0 002 2 2 2 0 002-2v-2" />
      <path d="M8 20h8" />
      <path d="M12 18v2" />
    </svg>
  );
}

export function MedalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="15" r="5" />
      <path d="M9 11L7 4h10l-2 7" />
      <path d="M12 13l1 2 2 .3-1.5 1.5.4 2.2L12 18l-1.9 1 .4-2.2L9 15.3 11 15z" />
    </svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3c2 4-3 5-3 9a3 3 0 003 3 3 3 0 003-3c0-2 1-3 1-3s2 2 2 5a6 6 0 11-12 0c0-4 4-6 6-11z" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 17l-5.3 2.7 1.1-6.1L3.4 9.4l6-.8z" />
    </svg>
  );
}

/** Compass — used for "Enrollment" / browse-the-catalog nav. */
export function CompassIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5L13 13l-4.5 2.5L11 11z" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13l3-8h12l3 8" />
      <path d="M3 13v6h18v-6" />
      <path d="M3 13h5l1 2h6l1-2h5" />
    </svg>
  );
}

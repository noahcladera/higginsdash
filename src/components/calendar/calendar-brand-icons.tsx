import type { SVGProps } from "react";

type BrandIconProps = SVGProps<SVGSVGElement> & { size?: number };

function brandBase({ size = 18, className, ...rest }: BrandIconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true as const,
    ...rest,
  };
}

/** Google Calendar app icon — simplified brand mark. */
export function GoogleCalendarIcon(props: BrandIconProps) {
  const { size = 18, ...rest } = props;
  return (
    <svg {...brandBase({ size, ...rest })}>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" />
      <rect x="3" y="3" width="9" height="9" rx="3" fill="#4285F4" />
      <rect x="12" y="3" width="9" height="9" rx="3" fill="#FBBC04" />
      <rect x="3" y="12" width="9" height="9" rx="3" fill="#34A853" />
      <rect x="12" y="12" width="9" height="9" rx="3" fill="#EA4335" />
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="#fff" />
      <path
        d="M9 11h6M9 14h4"
        stroke="#4285F4"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Apple Calendar app icon — simplified brand mark. */
export function AppleCalendarIcon(props: BrandIconProps) {
  const { size = 18, ...rest } = props;
  return (
    <svg {...brandBase({ size, ...rest })}>
      <rect x="3" y="4" width="18" height="17" rx="3.5" fill="#fff" />
      <rect x="3" y="4" width="18" height="6" rx="3.5" fill="#FF3B30" />
      <rect x="3" y="7" width="18" height="3" fill="#FF3B30" />
      <path
        d="M8 14h8M8 17h5"
        stroke="#86868b"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Overlapping Google + Apple marks for the compact trigger. */
export function CalendarBrandCluster({ size = 16 }: { size?: number }) {
  return (
    <span className="relative inline-flex h-[18px] w-[30px] shrink-0 items-center">
      <GoogleCalendarIcon
        size={size}
        className="absolute left-0 z-10 rounded-sm shadow-[0_0_0_1.5px_var(--card)]"
      />
      <AppleCalendarIcon
        size={size}
        className="absolute left-[14px] z-0 rounded-sm shadow-[0_0_0_1.5px_var(--card)]"
      />
    </span>
  );
}

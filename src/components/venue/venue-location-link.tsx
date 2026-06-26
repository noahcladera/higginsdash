import { formatVenueAddress, venueMapUrl } from "@/lib/maps";
import { cn } from "@/lib/utils";

export type VenueLocationFields = {
  name: string;
  mapUrl?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

/**
 * Venue name as a map link when we have enough data to build one.
 * Optionally shows a one-line address beneath the name.
 */
export function VenueLocationLink({
  venue,
  showAddress = false,
  className,
  nameClassName,
}: {
  venue: VenueLocationFields;
  showAddress?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const href = venueMapUrl(venue);
  const address = showAddress ? formatVenueAddress(venue) : null;

  return (
    <span className={className}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline-offset-4 hover:underline",
            nameClassName,
          )}
        >
          {venue.name}
        </a>
      ) : (
        <span className={nameClassName}>{venue.name}</span>
      )}
      {address && (
        <span className="block text-xs text-[var(--muted-foreground)]">
          {address}
        </span>
      )}
    </span>
  );
}

/**
 * Pickup route: school name (plain) → venue (linked).
 */
export function PickupVenueLocationLink({
  schoolName,
  venue,
  showAddress = false,
  className,
}: {
  schoolName: string;
  venue: VenueLocationFields;
  showAddress?: boolean;
  className?: string;
}) {
  return (
    <span className={className}>
      {schoolName} →{" "}
      <VenueLocationLink venue={venue} showAddress={showAddress} />
    </span>
  );
}

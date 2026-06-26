import { prisma } from "@/lib/prisma";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { VenueFormFields } from "./venue-form-fields";
import type { SimpleActionResult } from "@/lib/feedback/types";

/**
 * Shared venue create/edit form. Loads clubs + tenant labels on the
 * server, then renders the client form (needed for ImageUpload state).
 */
export async function VenueForm({
  action,
  submitLabel,
  venue,
  returnTo,
}: {
  action: (formData: FormData) => Promise<SimpleActionResult | void>;
  submitLabel: string;
  returnTo?: string;
  venue?: {
    id: string;
    slug: string;
    name: string;
    kind: "club" | "school" | "rented_court";
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    country: string;
    clubId: string | null;
    notes: string | null;
    coverImageUrl: string | null;
    coverImageFocusY: number;
  };
}) {
  const [clubs, brand, terms] = await Promise.all([
    prisma.club.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    getCurrentBrand(),
    getTerms(),
  ]);

  return (
    <VenueFormFields
      action={action}
      submitLabel={submitLabel}
      venue={venue}
      clubs={clubs}
      clubNoun={terms.club.singular}
      brandShortName={brand.shortName}
      schoolNoun={terms.school.singular}
      courtNoun={terms.court.singular}
      returnTo={returnTo}
    />
  );
}

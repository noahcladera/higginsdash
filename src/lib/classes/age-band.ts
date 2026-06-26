/** Minimum age for adult classes, events, and lessons. */
export const ADULT_MIN_AGE = 18;

export type CatalogAudience = "kids" | "adults" | "mixed";

export function isOpenEndedAdultMax(maxAge: number | null | undefined): boolean {
  return maxAge == null || maxAge >= 99;
}

export function programTargetToAudience(
  target: "kids" | "adults" | "mixed" | null | undefined,
): CatalogAudience {
  if (target === "adults") return "adults";
  if (target === "kids") return "kids";
  return "mixed";
}

export function inferCatalogAudience(args: {
  programTargetAudience: "kids" | "adults" | "mixed";
  formAudience?: "youth" | "adult" | null;
}): CatalogAudience {
  if (args.programTargetAudience === "adults") return "adults";
  if (args.programTargetAudience === "kids") return "kids";
  if (args.formAudience === "adult") return "adults";
  if (args.formAudience === "youth") return "kids";
  return "mixed";
}

/** Normalize stored ages — adults are always 18+ with no upper cap. */
export function normalizeStoredAgeBand(args: {
  audience?: CatalogAudience | null;
  minAge: number | null;
  maxAge: number | null;
}): { minAge: number | null; maxAge: number | null } {
  const min = args.minAge;
  const max = args.maxAge;

  if (args.audience === "adults") {
    return { minAge: ADULT_MIN_AGE, maxAge: null };
  }

  if (min === ADULT_MIN_AGE && isOpenEndedAdultMax(max)) {
    return { minAge: ADULT_MIN_AGE, maxAge: null };
  }

  return { minAge: min, maxAge: max };
}

export function isAdultSeries(args: {
  audience?: CatalogAudience | null;
  minAge?: number | null;
  maxAge?: number | null;
}): boolean {
  if (args.audience === "adults") return true;
  const normalized = normalizeStoredAgeBand({
    audience: args.audience ?? null,
    minAge: args.minAge ?? null,
    maxAge: args.maxAge ?? null,
  });
  return (
    normalized.minAge === ADULT_MIN_AGE && normalized.maxAge === null
  );
}

export function isAdultEvent(args: {
  classType?: string | null;
  audience?: CatalogAudience | null;
  minAge?: number | null;
  maxAge?: number | null;
}): boolean {
  if (args.classType !== "event") return false;
  return isAdultSeries(args);
}

export function ageIncludesYears(args: {
  minAge: number | null;
  maxAge: number | null;
  age: number;
}): boolean {
  const band = normalizeStoredAgeBand({
    minAge: args.minAge,
    maxAge: args.maxAge,
  });
  if (band.minAge != null && args.age < band.minAge) return false;
  if (band.maxAge != null && args.age > band.maxAge) return false;
  return true;
}

export function formatPublicAgeLabel(args: {
  minAge: number | null;
  maxAge: number | null;
  audience?: CatalogAudience | null;
  isEvent?: boolean;
  /** Prefix with "Ages " for portal copy. */
  withAgesPrefix?: boolean;
}): string | null {
  const { audience, isEvent, withAgesPrefix = false } = args;
  const normalized = normalizeStoredAgeBand({
    audience,
    minAge: args.minAge,
    maxAge: args.maxAge,
  });

  // Adult events: no age copy anywhere.
  if (
    isEvent &&
    isAdultSeries({
      audience,
      minAge: normalized.minAge,
      maxAge: normalized.maxAge,
    })
  ) {
    return null;
  }

  const prefix = withAgesPrefix ? "Ages " : "";
  const min = normalized.minAge;
  const max = normalized.maxAge;

  if (
    audience === "adults" ||
    (min === ADULT_MIN_AGE && isOpenEndedAdultMax(max))
  ) {
    return `${prefix}18+`.trim();
  }

  if (min != null && max != null) return `${prefix}${min}–${max}`.trim();
  if (min != null) return `${prefix}${min}+`.trim();
  if (max != null) return `${prefix}Up to ${max}`.trim();
  return null;
}

/** Stable keys for org-scoped marketing images (admin Settings → Photos). */
export const MARKETING_IMAGE_KEYS = {
  clubTriaz: "club:triaz",
  clubRandwijck: "club:randwijck",
  audienceYouth: "audience:youth",
  audienceAdults: "audience:adults",
  audiencePickup: "audience:pickup",
  tierAdult: "tier:adult",
  tierChild: "tier:child",
  tierFamily: "tier:family",
} as const;

export type MarketingImageKey =
  (typeof MARKETING_IMAGE_KEYS)[keyof typeof MARKETING_IMAGE_KEYS];

export const MARKETING_IMAGE_LABELS: Record<MarketingImageKey, string> = {
  [MARKETING_IMAGE_KEYS.clubTriaz]: "Triaz club tile",
  [MARKETING_IMAGE_KEYS.clubRandwijck]: "Randwijck club tile",
  [MARKETING_IMAGE_KEYS.audienceYouth]: "Youth promo tile",
  [MARKETING_IMAGE_KEYS.audienceAdults]: "Adults promo tile",
  [MARKETING_IMAGE_KEYS.audiencePickup]: "School pickup promo tile",
  [MARKETING_IMAGE_KEYS.tierAdult]: "Adult membership tier",
  [MARKETING_IMAGE_KEYS.tierChild]: "Child membership tier",
  [MARKETING_IMAGE_KEYS.tierFamily]: "Family membership tier",
};

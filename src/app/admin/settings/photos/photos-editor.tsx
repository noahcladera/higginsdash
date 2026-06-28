"use client";

import * as React from "react";

import { ImageUpload } from "@/components/ui/image-upload";
import { Button } from "@/components/ui/button";
import { useActionFeedback, toast } from "@/lib/feedback";
import {
  MARKETING_IMAGE_KEYS,
  MARKETING_IMAGE_LABELS,
  type MarketingImageKey,
} from "@/lib/uploads/marketing-images-keys";
import { setMarketingImage } from "@/lib/uploads/marketing-images";

const SECTIONS: Array<{
  title: string;
  description: string;
  keys: MarketingImageKey[];
}> = [
  {
    title: "Club tiles",
    description:
      "Hero photos on membership club cards (Triaz / Randwijck). Landscape works best.",
    keys: [MARKETING_IMAGE_KEYS.clubTriaz, MARKETING_IMAGE_KEYS.clubRandwijck],
  },
  {
    title: "Enrollment promo tiles",
    description:
      "Youth, adults, and school-pickup entry tiles on the programs landing page.",
    keys: [
      MARKETING_IMAGE_KEYS.audienceYouth,
      MARKETING_IMAGE_KEYS.audienceAdults,
      MARKETING_IMAGE_KEYS.audiencePickup,
    ],
  },
  {
    title: "Membership tiers",
    description:
      "Optional accents on active membership cards (adult / child / family).",
    keys: [
      MARKETING_IMAGE_KEYS.tierAdult,
      MARKETING_IMAGE_KEYS.tierChild,
      MARKETING_IMAGE_KEYS.tierFamily,
    ],
  },
];

export function PhotosEditor({
  initial,
}: {
  initial: Record<string, string>;
}) {
  const [urls, setUrls] = React.useState<Record<string, string>>(initial);
  const { run, pending, error } = useActionFeedback({
    success: "Saved",
    silentSuccess: true,
  });

  function onSave() {
    run(async () => {
      for (const section of SECTIONS) {
        for (const key of section.keys) {
          const url = urls[key] ?? "";
          const result = await setMarketingImage(key, url || null);
          if (!result.ok) {
            return {
              ok: false as const,
              error: `${MARKETING_IMAGE_LABELS[key]}: ${result.error}`,
            };
          }
        }
      }
      toast.success("Saved");
      return { ok: true as const };
    });
  }

  return (
    <div className="space-y-10">
      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {section.description}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {section.keys.map((key) => (
              <ImageUpload
                key={key}
                name={key}
                defaultUrl={urls[key] ?? ""}
                kind="cover"
                aspect="16/9"
                label={MARKETING_IMAGE_LABELS[key]}
                helpText={`Key: ${key}`}
                onChange={(next) =>
                  setUrls((prev) => ({ ...prev, [key]: next }))
                }
              />
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-6">
        <Button type="button" onClick={onSave} loading={pending}>
          {pending ? "Saving…" : "Save all photos"}
        </Button>
        {error && (
          <span className="text-sm text-[var(--danger)]">{error}</span>
        )}
      </div>
    </div>
  );
}

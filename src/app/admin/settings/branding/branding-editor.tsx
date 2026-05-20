"use client";

import * as React from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveBranding } from "./actions";

/**
 * Client-side editor for the branding page. Owns the three staged
 * values (logo URL, title, subline), renders the live Wordmark
 * preview, and submits through the `saveBranding` server action on
 * save. Nothing is persisted until the admin clicks Save — including
 * logo uploads, which do hit Supabase Storage on drop, but the
 * resulting URL stays local to this component's state until save.
 *
 * When the preview would be empty (title + subline both cleared), we
 * fall back to the `fallbackDisplayName` so the admin always has
 * *something* to aim at while tweaking.
 */
export function BrandingEditor({
  orgSlug: _orgSlug,
  defaultLogoUrl,
  defaultBrandTitle,
  defaultBrandSubline,
  fallbackDisplayName,
}: {
  orgSlug: string;
  defaultLogoUrl: string;
  defaultBrandTitle: string;
  defaultBrandSubline: string;
  fallbackDisplayName: string;
}) {
  const [logoUrl, setLogoUrl] = React.useState(defaultLogoUrl);
  const [brandTitle, setBrandTitle] = React.useState(defaultBrandTitle);
  const [brandSubline, setBrandSubline] = React.useState(defaultBrandSubline);

  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const form = new FormData();
    form.set("logoUrl", logoUrl);
    form.set("brandTitle", brandTitle);
    form.set("brandSubline", brandSubline);
    try {
      const result = await saveBranding(form);
      if (result.ok) {
        setStatus({ kind: "saved" });
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Save failed. Check your connection and try again.",
      });
    }
  }

  const previewTitle = brandTitle.trim() || fallbackDisplayName.split(" ")[0];
  const previewSubline = brandSubline.trim() || undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Logo</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Shown in the top-left of every page, on the login screen, and as the
            sender avatar in emails. Use a square PNG or WebP with a transparent
            background if you can.
          </p>
        </div>

        <ImageUpload
          name="logoUrl"
          defaultUrl={logoUrl}
          kind="logo"
          aspect="square"
          label="Organization logo"
          helpText="PNG, JPG, or WebP, up to 8MB. We'll resize it for the sidebar automatically."
          onChange={(next) => setLogoUrl(next)}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Display name</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            The name parents, players, and coaches see in the sidebar header.
            The subline is optional and is used as the small caps line under
            the title.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand-title">Brand title</Label>
            <Input
              id="brand-title"
              value={brandTitle}
              onChange={(e) => setBrandTitle(e.target.value)}
              placeholder="Your brand"
              maxLength={100}
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              The big word — usually your org's short name.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-subline">Brand subline</Label>
            <Input
              id="brand-subline"
              value={brandSubline}
              onChange={(e) => setBrandSubline(e.target.value)}
              placeholder="(optional subline)"
              maxLength={120}
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Optional. Shown in small caps under the title.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Live preview</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            This is how the sidebar header will render on the next page load
            after you save.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-8 py-10">
          <Wordmark
            size="lg"
            title={previewTitle}
            subline={previewSubline}
            logoUrl={logoUrl || undefined}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Saving…" : "Save branding"}
        </Button>
        {status.kind === "saved" && (
          <span className="text-sm text-[var(--muted-foreground)]">
            Saved. Reload any open tab to see it everywhere.
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-sm text-[var(--destructive)]">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}

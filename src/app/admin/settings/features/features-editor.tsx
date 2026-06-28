"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type FeatureFlagDescriptor,
  type FeatureFlagGroup,
  type FeatureFlags,
} from "@/lib/tenant/features";
import { useActionFeedback } from "@/lib/feedback";

import { resetOrgFeatures, updateOrgFeatures } from "../actions";

/**
 * Big grid of every feature flag, grouped into sections.
 *
 * - Each flag is a checkbox + a one-sentence description.
 * - Flags with `requires` go disabled when their dependency is off, with
 *   a tooltip explaining why.
 * - The "Reset to preset" button wipes overrides so the row inherits the
 *   preset's defaults again.
 *
 * State is held in React; we only call the server when the admin clicks
 * Save, so they can experiment without writing intermediate states.
 */
export function FeaturesEditor({
  groups,
  features,
  readOnly = false,
}: {
  groups: ReadonlyArray<FeatureFlagGroup>;
  features: FeatureFlags;
  /** When true (profile locked), show a read-only capability summary. */
  readOnly?: boolean;
}) {
  const [state, setState] = React.useState<FeatureFlags>(features);
  const { run, pending, error } = useActionFeedback({
    success: "Saved",
    successDescription: "Reload any open tab to see it everywhere.",
  });

  function toggle(key: keyof FeatureFlags, on: boolean) {
    setState((prev) => ({ ...prev, [key]: on }));
  }

  function isAvailable(flag: FeatureFlagDescriptor): boolean {
    if (!flag.requires || flag.requires.length === 0) return true;
    return flag.requires.every((dep) => state[dep]);
  }

  function onSave() {
    const form = new FormData();
    for (const [key, value] of Object.entries(state)) {
      if (value) form.set(key, "on");
    }
    run(() => updateOrgFeatures(form));
  }

  async function onReset() {
    if (
      !confirm(
        "Reset every feature toggle to the preset's defaults? Your custom overrides on this screen will be lost.",
      )
    ) {
      return;
    }
    run(async () => {
      const result = await resetOrgFeatures();
      if (result.ok) window.location.reload();
      return result;
    });
  }

  const enabledCount = Object.values(state).filter(Boolean).length;
  const totalCount = Object.values(state).length;

  if (readOnly) {
    const onCount = Object.values(features).filter(Boolean).length;
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
          Your <strong>feature bundle is locked</strong> to your industry preset (
          <strong>{onCount}</strong> capabilities on). Contact{" "}
          <strong className="text-[var(--foreground)]">platform support</strong>{" "}
          if you need additional modules enabled or disabled.
        </div>
        {groups.map((group) => {
          const enabled = group.flags.filter((f) => features[f.key]);
          if (enabled.length === 0) return null;
          return (
            <section
              key={group.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
            >
              <header className="mb-4">
                <h2 className="text-lg font-semibold">{group.label}</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {group.description}
                </p>
              </header>
              <ul className="grid gap-2 sm:grid-cols-2">
                {enabled.map((flag) => (
                  <li
                    key={String(flag.key)}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{flag.label}</span>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {flag.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]">
        <div className="text-sm">
          <strong>{enabledCount}</strong> of {totalCount} features enabled.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {error && (
            <span className="text-xs text-[var(--destructive)]">{error}</span>
          )}
          <Button variant="ghost" type="button" onClick={onReset} disabled={pending}>
            Reset to preset
          </Button>
          <Button type="button" onClick={onSave} loading={pending}>
            {pending ? "Saving…" : "Save features"}
          </Button>
        </div>
      </div>

      {groups.map((group) => (
        <section
          key={group.id}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <header className="mb-4">
            <h2 className="text-lg font-semibold">{group.label}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {group.description}
            </p>
          </header>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.flags.map((flag) => {
              const available = isAvailable(flag);
              const checked = state[flag.key] && available;
              return (
                <li
                  key={String(flag.key)}
                  className={
                    "rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 " +
                    (available ? "" : "opacity-60")
                  }
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={checked}
                      disabled={!available}
                      onChange={(e) => toggle(flag.key, e.currentTarget.checked)}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="text-sm font-medium">{flag.label}</div>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {flag.description}
                      </p>
                      {flag.requires && flag.requires.length > 0 && (
                        <p className="text-[11px] text-[var(--muted-foreground)]">
                          Requires:{" "}
                          {flag.requires.map((r, i) => (
                            <span key={String(r)}>
                              {i > 0 ? ", " : ""}
                              <code className="rounded bg-[var(--background)] px-1 py-0.5">
                                {String(r)}
                              </code>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

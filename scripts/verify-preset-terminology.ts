/**
 * Sanity-check industry presets:
 * - Merged terms (preset + defaults) must fill every known leaf path.
 * - For every preset except `custom`, each leaf must be set **explicitly**
 *   on `preset.terms` so locked-org identity stays self-contained in code.
 *
 *   npx tsx scripts/verify-preset-terminology.ts
 */
import { INDUSTRY_PRESETS, type IndustryPreset } from "../src/lib/tenant/presets";
import {
  DEFAULT_TERMS,
  TERM_KEY_PATHS,
  type Terms,
  type TermsOverrides,
} from "../src/lib/tenant/terms";

function mergeTerms(overrides: IndustryPreset["terms"]): Terms {
  const out: Terms = JSON.parse(JSON.stringify(DEFAULT_TERMS)) as Terms;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      (out as unknown as Record<string, unknown>)[key] = value;
    } else if (typeof value === "object") {
      const target = (out as unknown as Record<string, Record<string, string>>)[
        key
      ];
      if (target && typeof target === "object") {
        Object.assign(target, value);
      }
    }
  }
  return out;
}

function getLeaf(terms: Terms, path: string): string {
  const parts = path.split(".");
  let cur: unknown = terms;
  for (const p of parts) {
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : JSON.stringify(cur);
}

function getExplicitOverrideLeaf(
  overrides: TermsOverrides,
  path: string,
): string | undefined {
  if (!overrides || typeof overrides !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = overrides;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" && cur.trim().length > 0 ? cur.trim() : undefined;
}

let failed = false;
for (const preset of INDUSTRY_PRESETS) {
  const merged = mergeTerms(preset.terms);
  const missingMerged: string[] = [];
  for (const { path } of TERM_KEY_PATHS) {
    const v = getLeaf(merged, path);
    if (v === "" || v === "undefined") {
      missingMerged.push(path);
    }
  }
  if (missingMerged.length > 0) {
    console.error(
      `Preset "${preset.slug}" has empty leaves after merge:`,
      missingMerged.join(", "),
    );
    failed = true;
  } else {
    console.log(`OK  ${preset.slug} merge (${TERM_KEY_PATHS.length} paths)`);
  }

  if (preset.slug === "custom") continue;

  const missingExplicit: string[] = [];
  for (const { path } of TERM_KEY_PATHS) {
    const v = getExplicitOverrideLeaf(preset.terms, path);
    if (!v) missingExplicit.push(path);
  }
  if (missingExplicit.length > 0) {
    console.error(
      `Preset "${preset.slug}" missing explicit term overrides:`,
      missingExplicit.join(", "),
    );
    failed = true;
  } else {
    console.log(`OK  ${preset.slug} explicit (${TERM_KEY_PATHS.length} paths)`);
  }
}

if (failed) process.exit(1);

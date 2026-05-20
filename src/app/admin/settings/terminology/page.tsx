import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentOrg, TERM_KEY_PATHS, getPreset } from "@/lib/tenant";

import { TerminologyEditor } from "./terminology-editor";

/**
 * Terminology rename screen.
 *
 * One input per leaf-key from `TERM_KEY_PATHS`. Each input is prefilled
 * with the active value (which is the preset default plus any override
 * already saved); typing a new value and saving stores it as an override
 * the next request reads.
 *
 * Live preview at the top of each section shows the label rendering with
 * the staged values, so admins can see "Add Coach" turn into "Add
 * Teacher" before they save.
 */
export default async function AdminTerminologyPage() {
  await requireAdmin();
  const org = await getCurrentOrg();
  const preset = getPreset(org.presetSlug);

  // Flatten the active terms object into a `path → value` map so the
  // client editor can render one input per known path without having to
  // know the (slightly nested) `Terms` shape.
  const initial: Record<string, string> = {};
  for (const { path } of TERM_KEY_PATHS) {
    initial[path] = readPath(org.terms as unknown, path);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Terminology"
        description={
          org.profileLocked
            ? `Glossary for your industry preset (${preset.label}). Wording is locked; contact platform support if a label truly needs to change.`
            : `Rename any domain word to match how your members talk. Empty inputs fall back to the preset's defaults — leave them as-is unless they don't fit. Active preset: ${preset.label}. When you confirm an industry preset, this page becomes read-only.`
        }
      />
      <TerminologyEditor initial={initial} readOnly={org.profileLocked} />
    </div>
  );
}

function readPath(source: unknown, path: string): string {
  if (!source || typeof source !== "object") return "";
  const parts = path.split(".");
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return "";
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : "";
}

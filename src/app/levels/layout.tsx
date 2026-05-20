import { LevelsAppShell } from "@/lib/levels/levels-app-shell";
import { requireFeature } from "@/lib/tenant";

/** Level copy lives in Postgres; avoid build-time DB reads. */
export const dynamic = "force-dynamic";

export default async function LevelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("levels");
  return <LevelsAppShell>{children}</LevelsAppShell>;
}

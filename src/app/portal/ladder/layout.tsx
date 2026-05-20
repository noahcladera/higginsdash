import { requireFeature } from "@/lib/tenant";

export default async function PortalLadderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("ladder");
  return <>{children}</>;
}

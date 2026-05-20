import { requireFeature } from "@/lib/tenant";

export default async function PortalMembershipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("memberships");
  return <>{children}</>;
}

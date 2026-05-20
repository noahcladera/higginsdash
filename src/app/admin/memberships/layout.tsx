import { requireFeature } from "@/lib/tenant";

export default async function AdminMembershipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("memberships");
  return <>{children}</>;
}

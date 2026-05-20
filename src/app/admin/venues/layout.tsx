import { requireFeature } from "@/lib/tenant";

export default async function AdminVenuesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("venues");
  return <>{children}</>;
}

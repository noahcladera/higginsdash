import { requireFeature } from "@/lib/tenant";

export default async function PortalBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("courtBookings");
  return <>{children}</>;
}

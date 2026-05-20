import { requireFeature } from "@/lib/tenant";

export default async function PortalBookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("courtBookings");
  return <>{children}</>;
}

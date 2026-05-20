import { requireFeature } from "@/lib/tenant";

export default async function AdminBookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("courtBookings");
  return <>{children}</>;
}

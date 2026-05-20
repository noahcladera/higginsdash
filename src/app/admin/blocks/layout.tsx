import { requireFeature } from "@/lib/tenant";

export default async function AdminBlocksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("courtBookings");
  return <>{children}</>;
}

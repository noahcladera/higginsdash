import { requireFeature } from "@/lib/tenant";

export default async function AdminEventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("events");
  return <>{children}</>;
}

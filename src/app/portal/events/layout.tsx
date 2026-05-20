import { requireFeature } from "@/lib/tenant";

export default async function PortalEventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("events");
  return <>{children}</>;
}

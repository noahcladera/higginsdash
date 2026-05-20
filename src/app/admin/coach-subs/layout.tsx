import { requireFeature } from "@/lib/tenant";

export default async function AdminCoachSubsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("coachSubs");
  return <>{children}</>;
}

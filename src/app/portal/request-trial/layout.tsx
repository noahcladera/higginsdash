import { requireFeature } from "@/lib/tenant";

export default async function PortalRequestTrialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("trialInterest");
  return <>{children}</>;
}

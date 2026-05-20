import { requireFeature } from "@/lib/tenant";

export default async function AdminTrialInterestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("trialInterest");
  return <>{children}</>;
}

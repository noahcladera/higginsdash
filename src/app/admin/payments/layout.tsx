import { requireFeature } from "@/lib/tenant";

export default async function AdminPaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("payments");
  return <>{children}</>;
}

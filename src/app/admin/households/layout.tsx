import { requireFeature } from "@/lib/tenant";

export default async function AdminHouseholdsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("households");
  return <>{children}</>;
}

import { requireFeature } from "@/lib/tenant";

export default async function AdminSchoolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("schoolPartnerships");
  return <>{children}</>;
}

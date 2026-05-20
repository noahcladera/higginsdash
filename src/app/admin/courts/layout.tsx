import { requireFeature } from "@/lib/tenant";

export default async function AdminCourtsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("courts");
  return <>{children}</>;
}

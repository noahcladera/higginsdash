import { requireFeature } from "@/lib/tenant";

export default async function AdminCoachesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("coaches");
  return <>{children}</>;
}

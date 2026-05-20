import { requireFeature } from "@/lib/tenant";

export default async function AdminSeasonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("seasons");
  return <>{children}</>;
}

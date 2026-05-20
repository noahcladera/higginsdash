import { requireFeature } from "@/lib/tenant";

export default async function AdminCampsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("camps");
  return <>{children}</>;
}

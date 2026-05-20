import { requireFeature } from "@/lib/tenant";

export default async function AdminTransfersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("classTransfers");
  return <>{children}</>;
}

import { requireFeature } from "@/lib/tenant";

export default async function AdminInboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("inbox");
  return <>{children}</>;
}

import { requireFeature } from "@/lib/tenant";

export default async function AdminLadderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("ladder");
  return <>{children}</>;
}

import { requireFeature } from "@/lib/tenant";

export default async function AdminClassesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("classes");
  return <>{children}</>;
}

import { requireFeature } from "@/lib/tenant";

export default async function AdminProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("programs");
  return <>{children}</>;
}

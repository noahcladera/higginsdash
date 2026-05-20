import { requireFeature } from "@/lib/tenant";

export default async function AdminPrivateLessonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("coachPrivateLessonInvoicing");
  return <>{children}</>;
}

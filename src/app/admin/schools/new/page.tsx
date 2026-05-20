import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { createSchool } from "../actions";
import { SchoolForm } from "../school-form";

export default async function NewSchoolPage() {
  await requireAdmin();
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin · Schools"
        title="New school"
        description="A school is a pickup origin. Only one dial to set: how many minutes before pickup the coach has to be at Triaz to grab the gocab."
      />
      <SchoolForm action={createSchool} submitLabel="Create school" />
    </div>
  );
}

import Link from "next/link";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClassIcon, PlusIcon } from "@/components/icons";
import { ClassRow, type ClassRowData } from "./class-row";

export function AdminClassesListView({
  rows,
  q,
  sessionCountInWindow,
  windowLabel,
}: {
  rows: ClassRowData[];
  q: string;
  sessionCountInWindow: number;
  windowLabel: string;
}) {
  const sectionTitle = `${rows.length} series${q ? ` matching "${q}"` : ""}`;

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        <span className="font-medium text-[var(--foreground)]">
          {sessionCountInWindow} session{sessionCountInWindow === 1 ? "" : "s"}
        </span>{" "}
        in {windowLabel} (same filters as the calendar).
      </p>

      <Section title={sectionTitle}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClassIcon size={20} />}
            title={q ? `No classes match "${q}".` : "No classes yet"}
            description={
              q
                ? "Try fewer words or widen status / time filters."
                : "Create your first class series to start generating sessions."
            }
            action={
              !q ? (
                <Button asChild tone="triaz" size="sm">
                  <Link href="/admin/classes/new">Create a class</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Season</TableHead>
                  <TableHead>Coaches</TableHead>
                  <TableHead className="text-right tabular">Enrolled</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <ClassRow key={r.id} data={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

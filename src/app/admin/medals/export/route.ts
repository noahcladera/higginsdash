import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getTotalByCoachReport,
  totalByCoachToCsv,
} from "@/lib/medals/total-by-coach";

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const rows = await getTotalByCoachReport({
    seasonId: url.searchParams.get("seasonId") ?? undefined,
    clubId: url.searchParams.get("clubId") ?? undefined,
    coachPersonId: url.searchParams.get("coachId") ?? undefined,
  });
  const csv = totalByCoachToCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="total-by-coach.csv"',
    },
  });
}

import { redirect } from "next/navigation";
import { formatLocalDate } from "@/lib/booking/time";

interface PageProps {
  searchParams: Promise<{
    club?: string;
    date?: string;
    view?: "day" | "week";
  }>;
}

/** Legacy route — court schedule now lives on the admin dashboard. */
export default async function AdminBookingsRedirectPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const date = sp.date ?? formatLocalDate(new Date());
  const params = new URLSearchParams({
    panel: "schedule",
    date,
  });
  if (sp.club === "randwijck") {
    params.set("triaz", "0");
  } else if (sp.club === "triaz") {
    params.set("randwijck", "0");
  }
  redirect(`/admin?${params.toString()}`);
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  formatMedalLevel,
  medalShortCode,
  type MedalLevelValue,
} from "@/lib/medal-levels";
import { medalChipClass } from "@/lib/medals/medal-chip-colors";

export function MedalBadge({
  level,
  detailHref,
}: {
  level: string | null;
  /** Coach UI: `/coach/medals/[level]`. Default: parent `/levels/kids`. */
  detailHref?: "coach" | "parent";
}) {
  const listHref = detailHref === "coach" ? "/coach/medals" : "/levels/kids";
  const levelHref =
    level && detailHref === "coach"
      ? `/coach/medals/${level}`
      : listHref;

  if (!level) {
    return (
      <Badge
        asChild
        variant="outline"
        className="font-normal hover:bg-[var(--muted)]/40"
      >
        <Link href={listHref} title="See what each medal means">
          Medal not set
        </Link>
      </Badge>
    );
  }
  const chip = medalChipClass(level);
  return (
    <Badge asChild className={`hover:opacity-90 ${chip}`}>
      <Link
        href={levelHref}
        title="See what this medal means"
      >
        {medalShortCode(level)} · {formatMedalLevel(level)}
      </Link>
    </Badge>
  );
}

export type { MedalLevelValue };

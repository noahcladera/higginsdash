import type { MedalLevelValue } from "@/lib/medal-levels";

export const MEDAL_CHIP_COLORS: Partial<Record<MedalLevelValue, string>> = {
  rwb: "bg-gradient-to-r from-red-500 via-white to-blue-600 text-[var(--foreground)]",
  yellow: "bg-yellow-300 text-yellow-950",
  purple: "bg-purple-400 text-purple-950",
  blue_1: "bg-blue-400 text-blue-950",
  blue_2: "bg-blue-600 text-white",
  red_1: "bg-red-500 text-white",
  red_2: "bg-red-700 text-white",
  orange_1: "bg-orange-400 text-orange-950",
  orange_2: "bg-orange-600 text-white",
  green_1: "bg-green-400 text-green-950",
  green_2: "bg-green-600 text-white",
};

export function medalChipClass(level: string): string {
  return (
    MEDAL_CHIP_COLORS[level as MedalLevelValue] ??
    "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
  );
}

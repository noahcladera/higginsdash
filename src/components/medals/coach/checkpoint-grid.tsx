import type { MedalCurriculumLevel } from "@/lib/medals/curriculum";
import { CHECKPOINT_PART_LABELS } from "@/lib/medals/curriculum";

export function CheckpointGrid({ level }: { level: MedalCurriculumLevel }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/40">
            <th className="px-4 py-2 text-left font-medium">Part</th>
            <th className="px-4 py-2 text-left font-medium">Skill area</th>
            <th className="px-4 py-2 text-left font-medium">Requirement</th>
          </tr>
        </thead>
        <tbody>
          {level.checkpoints.map((cp) => (
            <tr
              key={cp.part}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {cp.part}
              </td>
              <td className="px-4 py-3 font-medium">
                {cp.label}
                <div className="text-xs font-normal text-[var(--muted-foreground)]">
                  {CHECKPOINT_PART_LABELS[cp.part]}
                </div>
              </td>
              <td className="px-4 py-3 leading-relaxed">{cp.requirement}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

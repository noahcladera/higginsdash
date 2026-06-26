import {
  classDeliveryBorderClasses,
  clubVenueFillClasses,
} from "@/lib/admin/schedule-slot-colors";
import { cn } from "@/lib/utils";

export function LegendChip({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded border border-[var(--border)] px-1.5 py-0.5",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ScheduleClassesLegend() {
  return (
    <div className="flex flex-col gap-2 text-[11px] text-[var(--muted-foreground)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--foreground)]">Venue:</span>
        <LegendChip
          className={cn(
            "border-transparent",
            clubVenueFillClasses("triaz"),
            "text-[var(--triaz-ink)]",
          )}
          label="S.V. Triaz"
        />
        <LegendChip
          className={cn(
            "border-transparent",
            clubVenueFillClasses("randwijck"),
            "text-[var(--randwijck-ink)]",
          )}
          label="Tennispark Randwijck"
        />
        <LegendChip
          className={cn(
            "border-transparent",
            clubVenueFillClasses(null),
            "text-[var(--muted-foreground)]",
          )}
          label="On-site / other"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--foreground)]">Class type:</span>
        <LegendChip
          className={cn(
            "bg-[var(--card)]",
            classDeliveryBorderClasses({
              deliveryMode: "at_club",
              classType: "group_lesson",
            }),
          )}
          label="At club"
        />
        <LegendChip
          className={cn(
            "bg-[var(--card)]",
            classDeliveryBorderClasses({
              deliveryMode: "pickup",
              classType: "school_pickup",
            }),
          )}
          label="Pickup"
        />
        <LegendChip
          className={cn(
            "bg-[var(--card)]",
            classDeliveryBorderClasses({
              deliveryMode: "onsite",
              classType: "school_onsite",
            }),
          )}
          label="On-site"
        />
        <LegendChip
          className={cn(
            "bg-[var(--card)]",
            classDeliveryBorderClasses({
              deliveryMode: "at_club",
              classType: "private_individual",
            }),
          )}
          label="Private"
        />
      </div>
    </div>
  );
}

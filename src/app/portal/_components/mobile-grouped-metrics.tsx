import { GroupedSection } from "@/components/ui/grouped-list";

export function MobileGroupedMetrics({
  items,
}: {
  items: {
    label: string;
    value: React.ReactNode;
    hint?: string;
  }[];
}) {
  return (
    <div className="lg:hidden">
      <GroupedSection>
        <li className="grouped-row p-0">
          <div className="grid w-full grid-cols-2 divide-x divide-y divide-[var(--content-separator)]">
            {items.map((item) => (
              <div key={item.label} className="px-4 py-3">
                <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {item.label}
                </div>
                <div className="font-display text-xl font-medium tabular leading-tight">
                  {item.value}
                </div>
                {item.hint && (
                  <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {item.hint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </li>
      </GroupedSection>
    </div>
  );
}

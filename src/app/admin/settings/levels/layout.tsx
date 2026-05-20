import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireFeature } from "@/lib/tenant";

export default async function AdminLevelContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("levels");
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">
        <Tab href="/admin/settings/levels/kids" label="Kids" />
        <Tab href="/admin/settings/levels/adults" label="Adults" />
      </div>
      {children}
    </div>
  );
}

function Tab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/50",
      )}
    >
      {label}
    </Link>
  );
}

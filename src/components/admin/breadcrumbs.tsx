import Link from "next/link";

/**
 * Lightweight breadcrumbs for admin detail pages. The old admin
 * `PageHeader` baked crumbs in; now that we're on the shared
 * `@/components/ui/page-header`, we render crumbs separately above the
 * header so every admin detail page keeps its "you are here" trail.
 */
export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {c.href ? (
            <Link
              href={c.href}
              className="hover:text-[var(--foreground)] hover:underline"
            >
              {c.label}
            </Link>
          ) : (
            <span className="text-[var(--foreground)]">{c.label}</span>
          )}
          {i < items.length - 1 && <span aria-hidden>/</span>}
        </span>
      ))}
    </nav>
  );
}

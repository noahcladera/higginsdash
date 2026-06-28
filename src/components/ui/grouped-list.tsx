import * as React from "react";

import { cn } from "@/lib/utils";

export function GroupedSection({
  header,
  footer,
  className,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mb-6", className)}>
      {header && (
        <div className="grouped-section-header">{header}</div>
      )}
      <ul className="grouped-section list-none p-0 m-0">{children}</ul>
      {footer && (
        <div className="grouped-section-footer">{footer}</div>
      )}
    </section>
  );
}

export function GroupedRow({
  className,
  children,
  asChild,
  ...props
}: React.HTMLAttributes<HTMLLIElement> & { asChild?: boolean }) {
  return (
    <li
      className={cn("grouped-row", className)}
      {...props}
    >
      {children}
    </li>
  );
}

export function GroupedLinkRow({
  href,
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <li className="grouped-row p-0">
      <a
        href={href}
        className={cn(
          "flex min-h-[2.75rem] w-full items-center gap-3 px-4 py-2.5",
          "text-[var(--foreground)] no-underline active:bg-[var(--muted)]/40",
          className,
        )}
        {...props}
      >
        {children}
      </a>
    </li>
  );
}

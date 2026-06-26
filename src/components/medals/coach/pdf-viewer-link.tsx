import Link from "next/link";

export function PdfViewerLink({
  href,
  label,
  embed,
}: {
  href: string;
  label: string;
  embed?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          {label} (open PDF)
        </Link>
      </div>
      {embed && (
        <iframe
          src={href}
          title={label}
          className="h-[32rem] w-full rounded-xl border border-[var(--border)]"
        />
      )}
    </div>
  );
}

export function ReferenceLinks() {
  return (
    <ul className="space-y-2 text-sm">
      <li>
        <Link
          href="/curriculum/medals/medal-requirements-yellow-orange-2.pdf"
          target="_blank"
          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          Medal requirements — Yellow through Orange 2 (PDF)
        </Link>
      </li>
      <li>
        <Link
          href="/curriculum/medals/medal-requirements-green-silver.pdf"
          target="_blank"
          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          Medal requirements — Green through Silver (PDF)
        </Link>
      </li>
      <li>
        <Link
          href="/curriculum/medals/ages-4-7-medals-check.pdf"
          target="_blank"
          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          Ages 4–7 medals check flowchart (PDF)
        </Link>
      </li>
    </ul>
  );
}

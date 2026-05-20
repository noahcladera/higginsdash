/**
 * Parse common list-page query parameters: ?q=, ?page=, ?archived=1.
 *
 * Used on /admin/people, /admin/households, etc. so all list pages handle
 * URL params identically.
 */
export type ListParams = {
  q: string;
  page: number;
  showArchived: boolean;
  pageSize: number;
};

export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  opts: { defaultPageSize?: number } = {},
): ListParams {
  const pageSize = opts.defaultPageSize ?? 25;
  const q = (firstValue(searchParams.q) ?? "").trim();
  const showArchived = firstValue(searchParams.archived) === "1";

  const pageRaw = parseInt(firstValue(searchParams.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return { q, page, showArchived, pageSize };
}

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

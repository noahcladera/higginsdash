/**
 * Strip legacy seed placeholder prefixes from public copy. Production DB
 * rows may still carry "STUB · …" until admin rewrites descriptions.
 */
export function stripStubPrefix(
  text: string | null | undefined,
): string | undefined {
  if (!text) return undefined;
  const stripped = text.replace(/^STUB\s*·\s*/i, "").trim();
  return stripped.length > 0 ? stripped : undefined;
}

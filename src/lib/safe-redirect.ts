/**
 * Returns true if `path` is a same-origin relative nav path (no protocol / open redirects).
 * Allows an internal query string, e.g. `/coach/accept-invite?token=…`.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (path == null || path === "") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  const q = path.indexOf("?");
  const pathOnly = q >= 0 ? path.slice(0, q) : path;
  if (pathOnly.includes("//")) return false;
  if (path.includes(":\\") || path.includes("&#")) return false;
  return true;
}

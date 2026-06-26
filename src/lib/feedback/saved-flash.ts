/** Query param read by {@link SavedFlash} after a create redirect. */
export const SAVED_FLASH_PARAM = "saved";

/**
 * Append `?saved=1` so the destination page can fire a one-time toast.
 * Use on server-side `redirect()` after create flows.
 */
export function savedRedirectPath(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${SAVED_FLASH_PARAM}=1`;
}

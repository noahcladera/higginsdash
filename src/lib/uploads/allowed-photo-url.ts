/**
 * Profile / coach photos must be https URLs on our Supabase Storage host.
 */
export function isAllowedPhotoUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    try {
      if (parsed.host !== new URL(supabaseUrl).host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

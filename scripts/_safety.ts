/**
 * Shared guard for destructive maintenance scripts (wipe / fresh-start).
 *
 * Two layers of protection:
 *   1. Refuse to run when NODE_ENV=production unless explicitly overridden.
 *   2. Require an explicit confirmation token so a destructive command can
 *      never run by accident (e.g. wrong terminal, fat-fingered npm script).
 *
 * Pass confirmation either way:
 *   CONFIRM_DESTRUCTIVE=YES npm run db:wipe-all
 *   npm run db:wipe-all -- --yes-i-am-sure
 */
export function assertDestructiveConfirmed(label: string): void {
  const confirmed =
    process.env.CONFIRM_DESTRUCTIVE === "YES" ||
    process.argv.includes("--yes-i-am-sure");

  const isProd = process.env.NODE_ENV === "production";
  const prodOverride = process.env.ALLOW_PRODUCTION_WIPE === "YES";

  if (isProd && !prodOverride) {
    console.error(
      `\nREFUSING: "${label}" cannot run with NODE_ENV=production.\n` +
        `If you REALLY mean it, set ALLOW_PRODUCTION_WIPE=YES as well.\n`,
    );
    process.exit(1);
  }

  if (!confirmed) {
    console.error(
      `\nREFUSING: "${label}" is destructive and was not confirmed.\n` +
        `Re-run with CONFIRM_DESTRUCTIVE=YES (or pass --yes-i-am-sure).\n` +
        `Target DB: ${maskDbUrl(process.env.DATABASE_URL)}\n`,
    );
    process.exit(1);
  }

  console.warn(
    `\n[destructive] "${label}" confirmed against ${maskDbUrl(process.env.DATABASE_URL)}\n`,
  );
}

function maskDbUrl(url: string | undefined): string {
  if (!url) return "(DATABASE_URL unset)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

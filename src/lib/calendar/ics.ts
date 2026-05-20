/**
 * Tiny iCalendar (RFC 5545) serializer.
 *
 * Why hand-rolled instead of an npm dep: the events we emit are minimal
 * — a SUMMARY, optional LOCATION/DESCRIPTION, and DTSTART/DTEND in UTC.
 * The full iCalendar standard is a swamp; this covers what Google
 * Calendar and Apple Calendar actually consume from a one-way
 * subscription feed without any transitive dependencies or unicode
 * surprises.
 *
 * Output rules followed here:
 *   - CRLF line endings (`\r\n`).
 *   - Lines folded at 75 octets per RFC 5545 §3.1.
 *   - TEXT values escape `\\`, `\n`, `,`, `;`.
 *   - DTSTART/DTEND emitted as `YYYYMMDDTHHMMSSZ` (UTC).
 *   - UID stable per session/owner so calendar updates replace the
 *     existing event rather than duplicating it.
 */

export interface IcsEvent {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  /**
   * Last-modified stamp. We treat the session's `updatedAt` as
   * `LAST-MODIFIED` so calendar clients can detect changes.
   */
  lastModified?: Date;
}

export interface IcsCalendar {
  /** Calendar name shown by clients. */
  name: string;
  /**
   * Persistent product id — RFC 5545 §3.7.3. Encodes our owner so
   * any future client-side debugging is unambiguous.
   */
  prodId?: string;
  events: IcsEvent[];
}

/** Serialize a full VCALENDAR blob, ready to return as `text/calendar`. */
export function serializeIcs(cal: IcsCalendar): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(
    `PRODID:${cal.prodId ?? "-//App//Calendar Feed 1.0//EN"}`,
  );
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeText(cal.name)}`);
  lines.push("X-PUBLISHED-TTL:PT15M");

  const dtstamp = formatUtc(new Date());
  for (const e of cal.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatUtc(e.startsAt)}`);
    lines.push(`DTEND:${formatUtc(e.endsAt)}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    }
    if (e.location) {
      lines.push(`LOCATION:${escapeText(e.location)}`);
    }
    if (e.lastModified) {
      lines.push(`LAST-MODIFIED:${formatUtc(e.lastModified)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * RFC 5545 line folding: split lines longer than 75 octets, with each
 * continuation line starting with a single space. We measure in octets
 * (UTF-8 byte length) because the spec is byte-oriented; multi-byte
 * characters must not be split mid-codepoint.
 */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let cursor = 0;
  let isFirst = true;
  while (cursor < bytes.length) {
    // First chunk gets 75 bytes, continuations get 74 (one byte goes to
    // the leading space).
    const limit = isFirst ? 75 : 74;
    let end = Math.min(cursor + limit, bytes.length);
    // Don't slice in the middle of a multi-byte codepoint: walk back
    // until we land on a UTF-8 starter byte (top bits != 10).
    while (end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }
    const chunk = new TextDecoder().decode(bytes.slice(cursor, end));
    out.push((isFirst ? "" : " ") + chunk);
    cursor = end;
    isFirst = false;
  }
  return out.join("\r\n");
}

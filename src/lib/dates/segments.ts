/**
 * Segmented date field helpers — ISO calendar dates (YYYY-MM-DD) in local civil time.
 */

export type SegmentKey = "d" | "m" | "y";

export interface Segments {
  d: string;
  m: string;
  y: string;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDateString(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const [, ys, ms, ds] = s.match(ISO_RE)!;
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Order of day / month / year in short numeric date for this locale (e.g. nl-NL → DMY). */
export function getSegmentOrder(locale: string): SegmentKey[] {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(new Date(2023, 10, 25));
    const order: SegmentKey[] = [];
    for (const p of parts) {
      if (p.type === "day") order.push("d");
      else if (p.type === "month") order.push("m");
      else if (p.type === "year") order.push("y");
    }
    if (order.length === 3) return order;
  } catch {
    /* fall through */
  }
  return ["d", "m", "y"];
}

export function isoToSegments(iso: string): Segments {
  if (!iso || !isIsoDateString(iso)) return { d: "", m: "", y: "" };
  const [, y, mo, d] = iso.match(ISO_RE)!;
  return {
    d: String(Number(d)),
    m: String(Number(mo)),
    y,
  };
}

function expandTwoDigitYear(yy: number, pivotYear: number): number {
  const pivot = pivotYear % 100;
  const century = Math.floor(pivotYear / 100) * 100;
  if (yy <= pivot + 50) return century + yy;
  return century - 100 + yy;
}

/**
 * Turn typed segments into ISO. Empty segments → null.
 * Year: 4 digits as-is; 1–3 digits padded (e.g. 2 → 2002 for DOB-ish); 2 digits use pivot.
 */
export function segmentsToIso(
  segments: Segments,
  options?: { pivotYear?: number },
): string | null {
  const { d: ds, m: ms, y: ys } = segments;
  if (!ds.trim() || !ms.trim() || !ys.trim()) return null;
  const d = Number(ds);
  const m = Number(ms);
  if (!Number.isInteger(d) || !Number.isInteger(m)) return null;
  if (m < 1 || m > 12) return null;
  let y: number;
  const yStr = ys.trim();
  if (yStr.length >= 4) {
    y = Number(yStr.slice(0, 4));
  } else if (yStr.length === 2) {
    const yy = Number(yStr);
    const pivot = options?.pivotYear ?? new Date().getFullYear();
    y = expandTwoDigitYear(yy, pivot);
  } else {
    const padded = yStr.padStart(4, "0");
    y = Number(padded);
    if (y < 1000) {
      const pivot = options?.pivotYear ?? new Date().getFullYear();
      y = expandTwoDigitYear(Number(yStr.padStart(2, "0")), pivot);
    }
  }
  if (!Number.isFinite(y) || y < 1 || y > 9999) return null;
  const dim = daysInMonth(y, m);
  const day = Math.min(Math.max(1, d), dim);
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yyyy = String(y).padStart(4, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function clampIsoToMinMax(
  iso: string,
  min?: string,
  max?: string,
): string {
  if (!isIsoDateString(iso)) return iso;
  let t = iso;
  if (min && isIsoDateString(min) && t < min) t = min;
  if (max && isIsoDateString(max) && t > max) t = max;
  return t;
}

export function parsePastedText(
  raw: string,
  locale: string,
): Segments | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return { d: String(Number(d)), m: String(Number(m)), y };
  }

  const slash = text.match(
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/,
  );
  if (slash) {
    const order = getSegmentOrder(locale);
    const g1 = slash[1];
    const g2 = slash[2];
    const g3 = slash[3];
    let d: number;
    let m: number;
    let yStr: string;

    if (g1.length === 4) {
      // Y-M-D
      yStr = g1;
      m = Number(g2);
      d = Number(g3);
    } else if (g3.length === 4) {
      // D-M-Y or M-D-Y
      yStr = g3;
      const a = Number(g1);
      const b = Number(g2);
      if (order[0] === "m" && order[1] === "d") {
        m = a;
        d = b;
      } else {
        d = a;
        m = b;
      }
    } else {
      // Short year at end: d/m/yy
      yStr = g3;
      const a = Number(g1);
      const b = Number(g2);
      if (order[0] === "m" && order[1] === "d") {
        m = a;
        d = b;
      } else {
        d = a;
        m = b;
      }
    }
    return {
      d: String(d),
      m: String(m),
      y: yStr.length === 2 ? yStr : yStr.slice(0, 4),
    };
  }

  // "2 jan 2003" / "2 januari 2003" (nl)
  const tryParsed = Date.parse(text.replace(/(\d)(st|nd|rd|th)\b/gi, "$1"));
  if (!Number.isNaN(tryParsed)) {
    const dt = new Date(tryParsed);
    if (!Number.isNaN(dt.getTime())) {
      return {
        d: String(dt.getDate()),
        m: String(dt.getMonth() + 1),
        y: String(dt.getFullYear()),
      };
    }
  }

  return null;
}

export function todayIso(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addYearsIso(iso: string, deltaYears: number): string | null {
  if (!isIsoDateString(iso)) return null;
  const [, ys, ms, ds] = iso.match(ISO_RE)!;
  const y = Number(ys) + deltaYears;
  const m = Number(ms);
  const d = Number(ds);
  const dim = daysInMonth(y, m);
  const dd = Math.min(d, dim);
  return `${String(y).padStart(4, "0")}-${ms}-${String(dd).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, deltaDays: number): string | null {
  if (!isIsoDateString(iso)) return null;
  const [, ys, ms, ds] = iso.match(ISO_RE)!;
  const dt = new Date(Number(ys), Number(ms) - 1, Number(ds));
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Next Monday on or after `iso` (inclusive). */
export function nextMondayIso(iso: string): string | null {
  if (!isIsoDateString(iso)) return null;
  const [, ys, ms, ds] = iso.match(ISO_RE)!;
  const dt = new Date(Number(ys), Number(ms) - 1, Number(ds));
  const dow = dt.getDay(); // 0 Sun … 6 Sat
  const add = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  dt.setDate(dt.getDate() + add);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function compareIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

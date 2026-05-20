/**
 * Display-layer formatters. Per the design doc R-cross-cutting rule, all
 * timestamps live in UTC at rest and are rendered in Europe/Amsterdam at
 * the display layer.
 */

const TZ = "Europe/Amsterdam";
const LOCALE = "en-NL";

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

export const format = {
  date(d: Date): string {
    return dateFmt.format(d);
  },
  dateTime(d: Date): string {
    return dateTimeFmt.format(d);
  },
  time(d: Date): string {
    return timeFmt.format(d);
  },
  /**
   * Whole-year age as of today, in Europe/Amsterdam. Returns "—" when no
   * date of birth is on file.
   */
  age(d: Date | null | undefined): string {
    if (!d) return "—";
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
      years -= 1;
    }
    if (years < 0) return "—";
    return years === 1 ? "1 year" : `${years} years`;
  },
};

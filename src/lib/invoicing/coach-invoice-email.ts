/**
 * Coach private-lesson invoice email body builder.
 *
 * The action layer encodes the date / time / duration of every line in
 * the `PaymentLine.description` string using one of two conventional
 * shapes (see `lineDescription` in `src/app/admin/private-lessons/actions.ts`):
 *
 *   "Private lesson YYYY-MM-DD HH:MM (NN min)"
 *   "Recurring lesson YYYY-MM-DD HH:MM (NN min) — <description>"
 *
 * We parse those back out so the email can render a clean fixed-width
 * table without a second DB roundtrip. Lines that don't match the
 * shape (legacy or hand-edited) fall through to a minimal renderer.
 */

const PRIVATE_RE =
  /^Private lesson (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \((\d+) min\)$/;
const RECURRING_RE =
  /^Recurring lesson (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \((\d+) min\)(?:\s+—\s+(.*))?$/;

export interface CoachInvoiceEmailLine {
  description: string;
  amount: number;
}

export interface BuildCoachInvoiceEmailInput {
  firstName: string;
  invoiceNumber: string;
  periodLabel: string;
  totalEur: number;
  checkoutUrl: string | null;
  lines: CoachInvoiceEmailLine[];
  /** Tenant short brand name. Used in the email subject + signature so
   *  the same template works for any org running this app. */
  brandName: string;
  /** Tenant private-lesson singular label (e.g. "Private lesson",
   *  "Class", "Session"). */
  privateLessonLabel: string;
}

export interface BuiltCoachInvoiceEmail {
  subject: string;
  body: string;
}

export function buildCoachInvoiceEmail(
  input: BuildCoachInvoiceEmailInput,
): BuiltCoachInvoiceEmail {
  const lessonLabel = input.privateLessonLabel || "Private lesson";
  const subject = `${input.brandName} ${lessonLabel.toLowerCase()} invoice ${input.invoiceNumber}`;

  const rows = input.lines.map((line) => parseLine(line, lessonLabel));
  const dateW = 10; // YYYY-MM-DD
  const timeW = 5; // HH:MM
  const durW = 5; // "60m"
  const courtW = Math.max(
    lessonLabel.length,
    ...rows.map((r) => r.label.length),
  );
  const amountW = Math.max(
    "Amount".length,
    ...input.lines.map((l) => formatEur(l.amount).length),
  );

  const header =
    pad("Date", dateW) +
    "  " +
    pad("Time", timeW) +
    "  " +
    pad("Dur", durW) +
    "  " +
    pad(lessonLabel, courtW) +
    "  " +
    padLeft("Amount", amountW);
  const rule = "-".repeat(header.length);

  const body = [
    `Hi ${input.firstName || "there"},`,
    "",
    `Here's the breakdown for ${input.invoiceNumber} — ${input.periodLabel}.`,
    "",
    header,
    rule,
    ...rows.map((r, i) => {
      const amt = formatEur(input.lines[i].amount);
      return (
        pad(r.date, dateW) +
        "  " +
        pad(r.time, timeW) +
        "  " +
        pad(r.dur, durW) +
        "  " +
        pad(r.label, courtW) +
        "  " +
        padLeft(amt, amountW)
      );
    }),
    rule,
    pad("", dateW + timeW + durW + courtW + 6) +
      padLeft(`Total ${formatEur(input.totalEur)}`, amountW + 6),
    "",
    input.checkoutUrl
      ? `Pay via Mollie: ${input.checkoutUrl}`
      : "A payment link will follow shortly.",
    "",
    "Reply to this email if anything looks off — happy to fix it.",
    `— ${input.brandName}`,
  ].join("\n");

  return { subject, body };
}

function parseLine(
  line: CoachInvoiceEmailLine,
  lessonLabel: string,
): {
  date: string;
  time: string;
  dur: string;
  label: string;
} {
  const recurring = line.description.match(RECURRING_RE);
  if (recurring) {
    const [, date, time, mins, desc] = recurring;
    return {
      date,
      time,
      dur: `${mins}m`,
      label: desc?.trim() || `Recurring ${lessonLabel.toLowerCase()}`,
    };
  }
  const oneOff = line.description.match(PRIVATE_RE);
  if (oneOff) {
    const [, date, time, mins] = oneOff;
    return {
      date,
      time,
      dur: `${mins}m`,
      label: lessonLabel,
    };
  }
  return {
    date: "—",
    time: "—",
    dur: "—",
    label: line.description,
  };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function formatEur(amountEur: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amountEur);
}

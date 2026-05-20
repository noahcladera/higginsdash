/** Format `amountCents` as `€12.50` / `-€3.00` for display. */
export function formatCreditAmount(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(amountCents);
  const euros = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}€${euros}.${cents}`;
}

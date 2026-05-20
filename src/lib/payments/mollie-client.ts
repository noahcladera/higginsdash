import createMollieClient, {
  type MollieClient,
  type Payment,
} from "@mollie/api-client";

import type { MollieAccount } from "@/lib/payments/mollie-accounts";
import { getMollieApiKey } from "@/lib/payments/config";

const clients = new Map<MollieAccount, MollieClient>();

export function getMollieClient(account: MollieAccount): MollieClient {
  const existing = clients.get(account);
  if (existing) return existing;

  const apiKey = getMollieApiKey(account);
  if (!apiKey) {
    throw new Error(
      `Mollie API key missing for account "${account}". Set MOLLIE_API_KEY_${account.toUpperCase()}.`,
    );
  }

  const client = createMollieClient({ apiKey });
  clients.set(account, client);
  return client;
}

export function formatMollieAmount(eur: number): string {
  return eur.toFixed(2);
}

export async function createMollieHostedPayment(args: {
  account: MollieAccount;
  amountEur: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata: Record<string, string>;
}): Promise<Payment> {
  const client = getMollieClient(args.account);
  return client.payments.create({
    amount: {
      currency: "EUR",
      value: formatMollieAmount(args.amountEur),
    },
    description: args.description.slice(0, 255),
    redirectUrl: args.redirectUrl,
    webhookUrl: args.webhookUrl,
    metadata: args.metadata,
  });
}

export async function fetchMolliePayment(
  account: MollieAccount,
  molliePaymentId: string,
): Promise<Payment> {
  const client = getMollieClient(account);
  return client.payments.get(molliePaymentId);
}

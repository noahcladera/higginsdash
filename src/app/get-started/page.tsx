import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { getCurrentBrand } from "@/lib/tenant";

/**
 * Public entry point for higginstennis.nl contact-form deflection.
 * Link here from the marketing site instead of routing lesson inquiries
 * to play@ — parents self-serve once they sign in.
 */
export default async function GetStartedPage() {
  const brand = await getCurrentBrand();

  const paths: { title: string; body: string; href: string; cta: string }[] = [
    {
      title: "Browse lessons & camps",
      body: "See what's running at Triaz and Randwijck by age, level, and day.",
      href: "/login?next=/portal/programs",
      cta: "Sign in to browse",
    },
    {
      title: "Get a membership",
      body: "Court access at S.V. Triaz and/or Tennispark Randwijck — renew online anytime.",
      href: "/login?next=/portal/membership",
      cta: "Sign in for membership",
    },
    {
      title: "Try a class first",
      body: "Not sure yet? Request a trial before you commit to a season.",
      href: "/login?next=/portal/request-trial",
      cta: "Request a trial",
    },
  ];

  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "Where do I see if class is on tonight?",
      a: (
        <>
          After you sign in, open{" "}
          <Link href="/login?next=/portal/inbox" className="underline-offset-4 hover:underline">
            your inbox
          </Link>{" "}
          or{" "}
          <Link href="/login?next=/portal/classes" className="underline-offset-4 hover:underline">
            My classes
          </Link>
          . Rain cancellations and schedule changes appear there — you do not
          need to email us for status.
        </>
      ),
    },
    {
      q: "How do I renew or check my membership?",
      a: (
        <>
          Sign in and go to{" "}
          <Link href="/login?next=/portal/membership" className="underline-offset-4 hover:underline">
            My membership
          </Link>
          . You can renew online in a few clicks; any lesson credit on your
          account shows on the overview and at checkout.
        </>
      ),
    },
    {
      q: "I paid — where is my receipt?",
      a: (
        <>
          All receipts and invoices live under{" "}
          <Link href="/login?next=/portal/payments" className="underline-offset-4 hover:underline">
            Payments
          </Link>{" "}
          once you are signed in.
        </>
      ),
    },
    {
      q: "Still need a person?",
      a: (
        <>
          Email{" "}
          <a
            href="mailto:play@higginstennis.nl"
            className="underline-offset-4 hover:underline"
          >
            play@higginstennis.nl
          </a>{" "}
          for anything the portal cannot handle — but most sign-ups, renewals,
          and schedule questions are faster self-serve.
        </>
      ),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-10 px-4 py-12">
      <PageHeader
        kicker={brand.displayName}
        title="Start here"
        description="Lessons, memberships, and schedule updates — all in the member portal. Sign in (or create an account) to continue."
        actions={
          <Button asChild tone="triaz">
            <Link href="/login">
              Sign in <ArrowRightIcon size={14} />
            </Link>
          </Button>
        }
      />

      <Section title="What do you need?" description="Pick the path that matches — we'll take you straight there after login.">
        <ul className="grid gap-4 sm:grid-cols-3">
          {paths.map((p) => (
            <li
              key={p.href}
              className="flex flex-col elev-card p-5"
            >
              <div className="mb-2 text-sm font-semibold">{p.title}</div>
              <p className="mb-4 flex-1 text-sm text-[var(--muted-foreground)]">
                {p.body}
              </p>
              <Button asChild tone="triaz" size="sm" variant="outline">
                <Link href={p.href}>
                  {p.cta} <ArrowRightIcon size={14} />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Quick answers">
        <div className="grid gap-4 sm:grid-cols-2">
          {faqs.map((f) => (
            <div
              key={f.q}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-1 flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--muted-foreground)]">
                  <CheckIcon size={12} />
                </span>
                <div className="text-sm font-semibold">{f.q}</div>
              </div>
              <div className="pl-7 text-sm text-[var(--muted-foreground)]">
                {f.a}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        New here?{" "}
        <Link href="/signup" className="underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}

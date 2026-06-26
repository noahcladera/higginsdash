import { createServerClient } from "@supabase/ssr";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function cookieFor(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: "higgins-test",
  });
  if (error) throw error;
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function fetchPage(path: string, cookie: string, timeoutMs = 90_000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookie },
      signal: ctrl.signal,
    });
    const html = await res.text();
    return {
      path,
      status: res.status,
      ms: Date.now() - t0,
      bytes: html.length,
      html,
      redirectedToLogin: res.url.includes("/login"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const results: Record<string, unknown> = { timings: [], flows: {} };

  const adult = await cookieFor("adult.example@higginstennisnl.test");
  const parent = await cookieFor("parent.multi.example@higginstennisnl.test");

  for (const [path, cookie] of [
    ["/portal/classes", adult],
    ["/portal/book", adult],
    ["/portal/family", parent],
    ["/portal/request-trial", adult],
    ["/portal/events", adult],
  ] as const) {
    try {
      const r = await fetchPage(path, cookie);
      results.timings.push({
        path,
        status: r.status,
        ms: r.ms,
        bytes: r.bytes,
        login: r.redirectedToLogin,
      });
    } catch (e) {
      results.timings.push({ path, error: String(e) });
    }
  }

  const series = await prisma.classSeries.findFirst({
    where: { status: "published", archivedAt: null },
    select: {
      id: true,
      name: true,
      whatsappUrl: true,
      program: { select: { slug: true, name: true } },
    },
  });
  if (series) {
    const path = `/portal/programs/${series.program.slug}/${series.id}`;
    const r = await fetchPage(path, parent);
    results.flows.seriesDetail = {
      path,
      ms: r.ms,
      hasEnrollPanel: /enroll|waitlist|full/i.test(r.html),
      hasWhatsapp: /whatsapp/i.test(r.html),
      whatsappInDb: !!series.whatsappUrl,
    };
  }

  // Flow M — expired membership
  const annaHh = "ffd99a67-e962-556d-a578-077bf84975ba";
  const mem = await prisma.membership.findFirst({
    where: { householdId: annaHh, status: "active" },
  });
  if (mem) {
    const orig = mem.expiresOn;
    await prisma.membership.update({
      where: { id: mem.id },
      data: { expiresOn: new Date("2020-01-01") },
    });
    const r = await fetchPage("/portal", adult);
    results.flows.expiredMembership = {
      hasExpiredBanner: /expired|reach out to the office/i.test(r.html),
      hasSelfServeRenew: /membership#buy|get a membership|renew/i.test(r.html),
      ms: r.ms,
    };
    const bookR = await fetchPage("/portal/book", adult);
    results.flows.expiredBooking = {
      hasGate: /membership|get a membership|coverage/i.test(bookR.html),
      ms: bookR.ms,
    };
    await prisma.membership.update({
      where: { id: mem.id },
      data: { expiresOn: orig },
    });
  }

  // Nav marker check from HTML
  const homeR = await fetchPage("/portal", parent);
  results.flows.parentHomeNav = {
    hasMyFamily: /my family/i.test(homeR.html),
    hasMyClasses: /my classes/i.test(homeR.html),
    hasRecommendedBeforeCalendar:
      homeR.html.toLowerCase().indexOf("recommended") <
        homeR.html.toLowerCase().indexOf("week") &&
      homeR.html.toLowerCase().includes("week"),
  };

  const signupR = await fetchPage("/signup", "");
  results.flows.signup = {
    hasParentFields: /parent|child|first name/i.test(signupR.html),
    ms: signupR.ms,
  };

  console.log(JSON.stringify(results, null, 2));
}

main().finally(() => prisma.$disconnect());

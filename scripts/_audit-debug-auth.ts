import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "adult.example@higginstennisnl.test",
    password: "higgins-test",
  });
  if (error || !data.session) throw error ?? new Error("no session");

  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookie = `sb-${projectRef}-auth-token=${encodeURIComponent(
    JSON.stringify([
      data.session.access_token,
      data.session.refresh_token,
      null,
      null,
      null,
    ]),
  )}`;

  const res = await fetch("http://localhost:3000/portal", {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const html = await res.text();
  writeFileSync("docs/audit/_portal-sample.html", html);
  console.log({
    status: res.status,
    location: res.headers.get("location"),
    len: html.length,
    hasSignIn: html.includes("Sign in"),
    hasBookCourt: /book a court/i.test(html),
    hasGoodMorning: /good (morning|afternoon|evening)/i.test(html),
    hasMembers: html.includes("Members"),
  });
}

main();

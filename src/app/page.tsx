import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(await defaultRouteForPerson(user.id));
  }
  redirect("/login");
}

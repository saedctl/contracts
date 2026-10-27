import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { config } from "../config";

/** Supabase client bound to the signed-in staff member's session cookies (anon key + RLS). */
export async function createSupabaseServerClient() {
  const s = config.supabase!;
  const store = await cookies();
  return createServerClient(s.url, s.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}

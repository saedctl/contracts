import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Keeps Supabase Auth sessions fresh (rotating the refresh token cookie) and sends signed-out
// visitors from staff pages to the login screen. Authorisation itself is enforced on the
// server in every page, route handler and server action — this is only a convenience layer.

const STAFF_PREFIXES = ["/dashboard", "/contracts", "/admin", "/account"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const isStaffPage = STAFF_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (url && key && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user && isStaffPage) return NextResponse.redirect(new URL("/", request.url));
  } else if (isStaffPage && !request.cookies.get("tec_session")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/sign|api/cron|sign/).*)"],
};

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { config, getSecret } from "../config";
import { getStore } from "../db";
import type { DemoStore } from "../db/demo";
import type { StaffUser } from "../types";
import { createSupabaseServerClient } from "./supabase-server";
import { rateLimit, resetRateLimit } from "../rate-limit";
import { requestMeta } from "../request";

const DEMO_COOKIE = "tec_session";
const DEMO_SESSION_HOURS = 8;

function demoKey() {
  return new TextEncoder().encode(getSecret("SESSION_SECRET"));
}

async function demoSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, demoKey(), { algorithms: ["HS256"], audience: "tec-dashboard" });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** The signed-in, active staff member for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<StaffUser | null> => {
  let userId: string | null;
  if (config.supabase) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser(); // verifies the JWT with Supabase Auth
    userId = data.user?.id ?? null;
  } else {
    userId = await demoSessionUserId();
  }
  if (!userId) return null;
  const user = await (await getStore()).getStaffById(userId);
  return user && user.active ? user : null;
});

export async function requireUser(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard?error=forbidden");
  return user;
}

export type SignInResult = { ok: true; user: StaffUser } | { ok: false; error: string };

export async function signIn(emailRaw: string, password: string): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  const key = `login:${ip ?? "unknown"}:${email}`;
  const limit = rateLimit(key, 5, 15 * 60_000);
  if (!limit.ok) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };

  const store = await getStore();
  let user: StaffUser | null = null;

  if (config.supabase) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      user = await store.getStaffById(data.user.id);
      if (!user || !user.active) {
        await supabase.auth.signOut();
        return { ok: false, error: "Your account does not have access to the dashboard. Contact an administrator." };
      }
    }
  } else {
    const found = await (store as DemoStore).verifyCredentials(email, password);
    if (found?.active) {
      user = found;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(found.id)
        .setAudience("tec-dashboard")
        .setIssuedAt()
        .setExpirationTime(`${DEMO_SESSION_HOURS}h`)
        .sign(demoKey());
      (await cookies()).set(DEMO_COOKIE, token, {
        httpOnly: true,
        secure: config.appUrl.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: DEMO_SESSION_HOURS * 3600,
      });
    }
  }

  if (!user) return { ok: false, error: "Incorrect email or password." };
  resetRateLimit(key);
  await store.addAuditEvent({
    contractId: null, actorType: "staff", actorId: user.id, actorLabel: user.email, event: "staff.signed_in",
    details: {}, ...(await requestMeta()),
  });
  return { ok: true, user };
}

export async function signOut() {
  if (config.supabase) {
    await (await createSupabaseServerClient()).auth.signOut();
  } else {
    (await cookies()).delete(DEMO_COOKIE);
  }
}

/** Re-checks a staff member's current password (used before changing it). */
export async function verifyPasswordFor(user: StaffUser, password: string): Promise<boolean> {
  if (config.supabase) {
    // Use a throwaway client so the check doesn't disturb the current session cookies.
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(config.supabase.url, config.supabase.anonKey, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: user.email, password });
    return !error;
  }
  const store = (await getStore()) as DemoStore;
  return !!(await store.verifyCredentials(user.email, password));
}

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const env = process.env;

function appUrl(): string {
  const explicit = env.APP_URL || env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const supabase =
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
    ? { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
    : null;

const dropboxSign =
  env.DROPBOX_SIGN_API_KEY && env.DROPBOX_SIGN_CLIENT_ID
    ? {
        apiKey: env.DROPBOX_SIGN_API_KEY,
        clientId: env.DROPBOX_SIGN_CLIENT_ID,
        // Test mode is free and produces non-binding documents. Must be explicitly disabled for live use.
        testMode: env.DROPBOX_SIGN_TEST_MODE !== "false",
      }
    : null;

const resend =
  env.RESEND_API_KEY && env.EMAIL_FROM
    ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO || undefined }
    : null;

/**
 * Demo mode is on when explicitly requested, or when no database is configured.
 * In demo mode any missing integration is simulated and clearly labelled as such.
 * Outside demo mode every integration is required and nothing is ever simulated.
 */
const demoMode = env.DEMO_MODE === "true" || !supabase;

export const config = {
  appUrl: appUrl(),
  demoMode,
  supabase,
  dropboxSign,
  resend,
  businessEmail: env.BUSINESS_NOTIFICATION_EMAIL || null,
  linkTtlDays: Number(env.SIGNING_LINK_TTL_DAYS || 30),
  retentionYears: Number(env.RETENTION_YEARS || 7),
  draftRetentionDays: Number(env.DRAFT_RETENTION_DAYS || 90),
  cronSecret: env.CRON_SECRET || null,
  demoDataDir: env.DEMO_DATA_DIR || (env.VERCEL ? "/tmp/tec-demo" : path.join(process.cwd(), ".data")),
};

export type IntegrationStatus = { name: string; configured: boolean; simulated: boolean; missing: string[] };

export function integrationStatus(): IntegrationStatus[] {
  const list: IntegrationStatus[] = [
    {
      name: "Database & staff auth (Supabase)",
      configured: !!supabase,
      simulated: !supabase,
      missing: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]),
    },
    {
      name: "E-signature (Dropbox Sign)",
      configured: !!dropboxSign,
      simulated: !dropboxSign,
      missing: ["DROPBOX_SIGN_API_KEY", "DROPBOX_SIGN_CLIENT_ID"].filter((k) => !env[k]),
    },
    {
      name: "Email (Resend)",
      configured: !!resend,
      simulated: !resend,
      missing: ["RESEND_API_KEY", "EMAIL_FROM"].filter((k) => !env[k]),
    },
  ];
  if (!demoMode) {
    for (const k of ["SESSION_SECRET", "SIGNING_LINK_SECRET", "BUSINESS_NOTIFICATION_EMAIL"]) {
      if (!env[k]) list.push({ name: k, configured: false, simulated: false, missing: [k] });
    }
  }
  return list;
}

/** Returns a list of problems that block sending real contracts. Empty when production-ready. */
export function productionBlockers(): string[] {
  if (demoMode) return [];
  return integrationStatus()
    .filter((i) => !i.configured)
    .map((i) => `${i.name}: missing ${i.missing.join(", ")}`);
}

const generatedSecrets = new Map<string, string>();

/**
 * Reads a secret from the environment. In demo mode only, a random secret is generated
 * and persisted locally so that local sessions and signing links survive restarts.
 */
export function getSecret(name: "SESSION_SECRET" | "SIGNING_LINK_SECRET"): string {
  const value = env[name];
  if (value) {
    if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
    return value;
  }
  if (!demoMode) throw new Error(`${name} is not set. Generate one with: openssl rand -base64 48`);
  const cached = generatedSecrets.get(name);
  if (cached) return cached;
  const file = path.join(config.demoDataDir, "secrets.json");
  let secrets: Record<string, string> = {};
  try {
    secrets = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  if (!secrets[name]) {
    secrets[name] = randomBytes(48).toString("base64url");
    fs.mkdirSync(config.demoDataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  generatedSecrets.set(name, secrets[name]);
  return secrets[name];
}

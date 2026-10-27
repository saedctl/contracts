// Netlify scheduled function: the Netlify equivalent of the Vercel Cron entry in vercel.json.
// Once a day it calls /api/cron/maintenance, which expires stale signing links, reconciles
// with Dropbox Sign in case a webhook was missed, and applies the data-retention policy.

export default async function maintenance() {
  const base = (process.env.APP_URL || process.env.URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("maintenance: APP_URL (or URL) and CRON_SECRET must be set");
    return new Response("Not configured", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/maintenance`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.text();
  console.log(`maintenance: ${res.status} ${body.slice(0, 500)}`);
  return new Response(body, { status: res.status });
}

export const config = { schedule: "17 3 * * *" };

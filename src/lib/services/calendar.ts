import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config, getSecret } from "../config";
import { getStore } from "../db";
import { buildIcs, type IcsEvent } from "../ics";
import { planOf } from "../payments";
import type { Contract, StaffUser } from "../types";
import { formatLongDate, formatMoney, todayISO } from "../utils";
import { BRAND } from "../brand";

// Payment-date calendars. Two kinds, both reached by a private link (calendar apps can't sign in):
//   member:  m.<contractId>.<mac>  — that member's own instalments only
//   staff:   s.<userId>.<mac>      — every signed contract the staff member can see
// The mac is an HMAC with the server secret, so links can't be guessed. Staff links include a
// per-user nonce kept in settings, so "Reset link" revokes a link that was shared by mistake.

export const REMINDERS = ["P7D", "PT24H", "PT0M"]; // 7 days before, 24 hours before, at 9am on the day
const NONCE_KEY = "calendar_feed_nonces";

function mac(payload: string) {
  return createHmac("sha256", getSecret("SIGNING_LINK_SECRET")).update(`calendar:${payload}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function staffNonce(userId: string, rotate = false): Promise<string> {
  const store = await getStore();
  const all = (await store.getSetting<Record<string, string>>(NONCE_KEY)) ?? {};
  if (all[userId] && !rotate) return all[userId];
  const nonce = randomBytes(9).toString("base64url");
  await store.setSetting(NONCE_KEY, { ...all, [userId]: nonce });
  return nonce;
}

export function memberCalendarToken(c: Pick<Contract, "id">) {
  return `m.${c.id}.${mac(`m:${c.id}`)}`;
}

export async function staffCalendarToken(user: StaffUser, rotate = false) {
  return `s.${user.id}.${mac(`s:${user.id}:${await staffNonce(user.id, rotate)}`)}`;
}

export type CalendarOwner = { kind: "member"; contract: Contract } | { kind: "staff"; user: StaffUser };

/** Resolves a calendar link, or null if it is invalid, revoked or the data no longer exists. */
export async function resolveCalendarToken(token: string): Promise<CalendarOwner | null> {
  const m = /^([ms])\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(token.replace(/\.ics$/, ""));
  if (!m) return null;
  const [, kind, id, given] = m;
  const store = await getStore();
  if (kind === "m") {
    if (!safeEqual(mac(`m:${id}`), given)) return null;
    const c = await store.getContract(id);
    return c && c.status === "signed" && !c.anonymisedAt ? { kind: "member", contract: c } : null;
  }
  const nonce = ((await store.getSetting<Record<string, string>>(NONCE_KEY)) ?? {})[id];
  if (!nonce || !safeEqual(mac(`s:${id}:${nonce}`), given)) return null;
  const user = await store.getStaffById(id);
  return user && user.active ? { kind: "staff", user } : null;
}

/** Events for one contract. Unpaid instalments carry the reminders; paid ones stay as a record. */
function contractEvents(c: Contract, audience: "member" | "staff"): IcsEvent[] {
  const today = todayISO();
  const plan = planOf(c, today);
  return plan.filter((it) => it.dueDate).map((it, i) => {
    const amount = formatMoney(it.amount, c.currency);
    const which = plan.length > 1 ? `Instalment ${i + 1} of ${plan.length}` : "Balance";
    const paid = !!it.collectedAt;
    const contractUrl = `${config.appUrl}/contracts/${c.id}`;
    return {
      uid: `${c.id}-${it.id}@theengineers.club`,
      date: it.dueDate!,
      summary: audience === "member"
        ? paid ? `✓ Paid: ${BRAND.name} ${amount}` : `${BRAND.name}: ${amount} payment due`
        : paid ? `✓ Paid: ${c.customerName} ${amount}` : `${amount} due: ${c.customerName}`,
      description: audience === "member"
        ? `${which} under your ${BRAND.name} membership agreement (${c.reference}), due ${formatLongDate(it.dueDate!)}.${paid ? " Received, thank you." : " We'll also send you a reminder with a payment link."}`
        : `${which} · ${c.reference} · ${c.customerEmail}${c.customerPhone ? ` · ${c.customerPhone}` : ""}\n${contractUrl}`,
      url: audience === "staff" ? contractUrl : undefined,
      alarms: paid ? [] : REMINDERS,
    };
  });
}

export function contractIcs(c: Contract, audience: "member" | "staff") {
  return buildIcs({
    name: audience === "member" ? `${BRAND.name} payments` : `Payments: ${c.customerName}`,
    events: contractEvents(c, audience),
  });
}

export async function calendarIcs(owner: CalendarOwner): Promise<string> {
  if (owner.kind === "member") return contractIcs(owner.contract, "member");
  const store = await getStore();
  const signed = await store.listContracts({ status: "signed", createdBy: owner.user.role === "admin" ? undefined : owner.user.id, limit: 100_000 });
  return buildIcs({
    name: `${BRAND.name}: member payments`,
    description: "Payment due dates for signed membership contracts. Updates automatically.",
    events: signed.filter((c) => !c.anonymisedAt).flatMap((c) => contractEvents(c, "staff")),
  });
}

/** Whether a contract has any dated payment still to come (worth offering a calendar for). */
export function hasUpcomingPayments(c: Contract) {
  return planOf(c, todayISO()).some((it) => it.dueDate && !it.collectedAt);
}

/** One-click links for the main calendar apps. Subscriptions update when payments are collected. */
export function calendarLinks(token: string, name: string) {
  const https = `${config.appUrl}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  return {
    page: `${config.appUrl}/calendar/${token}`,
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(name)}`,
    office365: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(name)}`,
    download: `${https}?download=1`,
    feed: https,
  };
}
export type CalendarLinks = ReturnType<typeof calendarLinks>;

import { createHash, randomBytes } from "node:crypto";
import type { Currency } from "./types";

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parses YYYY-MM-DD as a calendar date (UTC, no timezone drift). */
export function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 27 October 2026 */
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso.slice(0, 10));
  if (!d) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }).format(new Date(iso));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

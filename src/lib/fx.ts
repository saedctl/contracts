// Reporting currency conversion for the dashboard totals. Pure (usable on server and client).
//
// Dashboard and Payments totals are reported in GBP. A contract in another currency is converted at
// the exchange rate for the day it was signed. That rate is looked up once and remembered in app
// settings (keyed by contract id), never on the contract itself, so contracts are unaffected and the
// GBP figure doesn't change after the fact.

import type { Contract, Currency } from "./types";

export const REPORTING_CURRENCY: Currency = "GBP";

export interface FxRecord {
  from: Currency;
  to: Currency;
  /** 1 `from` = `rate` `to`. */
  rate: number;
  /** Date the rate applies to (the provider returns the last working day for weekends). YYYY-MM-DD */
  rateDate: string;
  source: string;
  recordedAt: string; // ISO
}

/** Remembered rates by contract id. */
export type FxRates = Record<string, FxRecord>;

type Conv = Pick<Contract, "id" | "currency">;

/** The remembered rate for a contract, if it needs one and has it. */
export function fxOf(c: Conv, rates: FxRates): FxRecord | null {
  if (c.currency === REPORTING_CURRENCY) return null;
  const fx = rates[c.id];
  return fx && fx.from === c.currency && fx.to === REPORTING_CURRENCY && fx.rate > 0 ? fx : null;
}

/** Converts an amount in the contract's own currency to GBP (rounded to the penny); null if no rate yet. */
export function toReporting(amount: number, c: Conv, rates: FxRates): number | null {
  if (c.currency === REPORTING_CURRENCY) return amount;
  const fx = fxOf(c, rates);
  return fx ? Math.round(amount * fx.rate * 100) / 100 : null;
}

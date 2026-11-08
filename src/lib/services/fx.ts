import "server-only";
import { getStore } from "../db";
import { REPORTING_CURRENCY, fxOf, type FxRates, type FxRecord } from "../fx";
import type { Contract, Currency } from "../types";
import { formatLongDate } from "../utils";
import { audit } from "./audit";

// Daily reference rates published by the European Central Bank, served by Frankfurter
// (free, no API key). FX_API_BASE overrides the host (used for local testing).
const API_BASE = (process.env.FX_API_BASE || "https://api.frankfurter.dev/v1").replace(/\/$/, "");
const SOURCE = "European Central Bank reference rate (via Frankfurter)";
const SETTING_KEY = "fx_rates";

const cache = new Map<string, { rate: number; rateDate: string }>();
const lastFailure = new Map<string, number>();

async function fetchRate(from: Currency, date: string): Promise<{ rate: number; rateDate: string }> {
  const key = `${from}:${date}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`${API_BASE}/${date}?base=${from}&symbols=${REPORTING_CURRENCY}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`FX rate lookup failed (${res.status})`);
  const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = body.rates?.[REPORTING_CURRENCY];
  if (typeof rate !== "number" || !(rate > 0) || !body.date) throw new Error("FX rate lookup returned no rate");
  const value = { rate, rateDate: body.date };
  cache.set(key, value);
  return value;
}

/**
 * Exchange rates for the dashboard totals. Signed contracts in a non-GBP currency get the rate
 * for the day they were signed, looked up once and remembered in app settings (the contract
 * itself is never changed). Never throws: a contract whose rate can't be found yet is left out
 * of GBP totals and retried later (at most every 10 minutes).
 */
export async function fxRatesFor(contracts: Contract[]): Promise<FxRates> {
  const store = await getStore();
  let rates: FxRates = {};
  try {
    rates = (await store.getSetting<FxRates>(SETTING_KEY)) ?? {};
  } catch (e) {
    console.error("fx rates unavailable", e);
    return rates;
  }
  const need = contracts.filter((c) => c.status === "signed" && !c.anonymisedAt && c.currency !== REPORTING_CURRENCY && !fxOf(c, rates));
  const found: FxRates = {};
  for (const c of need) {
    if (Date.now() - (lastFailure.get(c.id) ?? 0) < 10 * 60_000) continue;
    try {
      const { rate, rateDate } = await fetchRate(c.currency, (c.signedAt ?? c.updatedAt).slice(0, 10));
      found[c.id] = { from: c.currency, to: REPORTING_CURRENCY, rate, rateDate, source: SOURCE, recordedAt: new Date().toISOString() };
    } catch (e) {
      lastFailure.set(c.id, Date.now());
      console.error("fx rate lookup failed", c.id, e);
    }
  }
  if (Object.keys(found).length) {
    try {
      // Re-read before writing so rates saved by a concurrent request are kept.
      const latest = (await store.getSetting<FxRates>(SETTING_KEY)) ?? {};
      rates = { ...found, ...latest };
      await store.setSetting(SETTING_KEY, rates);
      // Record the rate in each contract's activity (the contract itself is not changed).
      for (const [id, fx] of Object.entries(found)) {
        if (latest[id]) continue; // another request recorded it first
        await audit(id, { type: "system" }, "contract.fx_rate_recorded", {
          rate: `1 ${fx.from} = ${fx.rate} ${fx.to}`,
          rateDate: formatLongDate(fx.rateDate),
          source: fx.source,
        });
      }
    } catch (e) {
      console.error("fx rates not saved", e);
      rates = { ...found, ...rates };
    }
  }
  return rates;
}

// Shared by client and server: keep free of Node-only imports.

function parse(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * End date for a membership of `months` starting on `start`: the day before the same
 * calendar day `months` later (e.g. 1 Jan + 1 month → 31 Jan). Clamps to month end.
 */
export function calculateEndDate(start: string, months: number): string {
  const d = parse(start);
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(y, m, Math.min(day, lastDay)));
  target.setUTCDate(target.getUTCDate() - 1);
  return iso(target);
}

/** Human description of a custom term, e.g. "4 months and 9 days". */
export function describeTerm(start: string, end: string): string {
  const s = parse(start);
  const e = parse(end);
  if (!s || !e || e < s) return "";
  // Count whole months that fit, using the same convention as calculateEndDate.
  let months = 0;
  while (true) {
    const next = calculateEndDate(start, months + 1);
    if (!next || next > end) break;
    months++;
  }
  const afterMonths = months ? parse(calculateEndDate(start, months))! : new Date(s.getTime() - 86400000);
  const days = Math.round((e.getTime() - afterMonths.getTime()) / 86400000);
  const parts: string[] = [];
  if (months) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(" and ") || "1 day";
}

export const DURATION_OPTIONS = [
  { value: "1", label: "1 month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "custom", label: "Custom" },
] as const;

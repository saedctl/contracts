"use client";

import { useState } from "react";
import type { MonthBucket } from "@/lib/cashflow";
import type { Currency } from "@/lib/types";

// Series colours: one bronze hue for money (solid = collected, light step = scheduled), and the
// reserved critical red for overdue. Identity never relies on colour alone: legend + tooltip + table.
const SERIES = [
  { key: "collected", label: "Collected", color: "#9b7442" },
  { key: "scheduled", label: "Scheduled", color: "#d9c4a0" },
  { key: "overdue", label: "Overdue", color: "#b42318" },
] as const;

const W = 760;
const H = 250;
const PAD = { top: 16, right: 8, bottom: 30, left: 52 };
const BAR = 24;
const GAP = 2;

function niceStep(max: number) {
  if (max <= 0) return 500;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function CashflowChart({ buckets, currency }: { buckets: MonthBucket[]; currency: Currency }) {
  const [hover, setHover] = useState<number | null>(null);
  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const axisMoney = (n: number) =>
    n >= 10_000
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n)
      : money(n);

  const totals = buckets.map((b) => b.collected + b.scheduled + b.overdue);
  const step = niceStep(Math.max(...totals, 1));
  const max = Math.max(step, Math.ceil(Math.max(...totals, 1) / step) * step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / buckets.length;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const currentIdx = buckets.findIndex((b) => b.isCurrent);

  return (
    <div className="relative">
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Cash collected and scheduled by month, ${buckets[0].longLabel} to ${buckets[buckets.length - 1].longLabel}`}>
        {/* "Today" divider between past and future */}
        {currentIdx >= 0 && (
          <rect x={PAD.left + band * currentIdx} y={PAD.top} width={band} height={plotH} fill="#9b7442" opacity={0.06} rx={6} />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e2da" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b665e" style={{ fontVariantNumeric: "tabular-nums" }}>
              {axisMoney(t)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = PAD.left + band * i + band / 2;
          const x = cx - BAR / 2;
          // Stack from the baseline: collected, then scheduled, then overdue; 2px surface gap between.
          const parts = SERIES.map((s) => ({ ...s, value: b[s.key] })).filter((p) => p.value > 0);
          let base = 0;
          const rects = parts.map((p, j) => {
            const top = y(base + p.value);
            const bottom = y(base) - (j > 0 ? GAP : 0);
            base += p.value;
            const h = Math.max(bottom - top, 1);
            const isTop = j === parts.length - 1;
            const r = isTop ? Math.min(4, h) : 0;
            // Rounded data-end on the top segment only; square at the baseline.
            const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + BAR - r} Q${x + BAR},${top} ${x + BAR},${top + r} V${top + h} Z`;
            return <path key={p.key} d={d} fill={p.color} />;
          });
          return (
            <g key={b.key}>
              {rects}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11.5} fill={b.isCurrent ? "#141414" : "#6b665e"} fontWeight={b.isCurrent ? 600 : 400}>
                {b.isCurrent ? `${b.label} · now` : b.label}
              </text>
              {/* Hit target: the whole band, not just the bar */}
              <rect
                x={PAD.left + band * i} y={PAD.top} width={band} height={plotH + 20} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                aria-label={`${b.longLabel}: collected ${money(b.collected)}, scheduled ${money(b.scheduled)}, overdue ${money(b.overdue)}`}
              />
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#d6cfc3" strokeWidth={1} />
      </svg>

      {hover !== null && (() => {
        const b = buckets[hover];
        const leftPct = ((PAD.left + band * hover + band / 2) / W) * 100;
        return (
          <div
            className="pointer-events-none absolute top-8 z-10 w-52 -translate-x-1/2 rounded-xl border border-line bg-white p-3 text-[13px] shadow-pop"
            style={{ left: `clamp(110px, ${leftPct}%, calc(100% - 110px))` }}
          >
            <p className="font-semibold">{b.longLabel}</p>
            <dl className="mt-1.5 space-y-1">
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-muted"><span className="size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />{s.label}</dt>
                  <dd className="tabular-nums">{money(b[s.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })()}

      <table className="sr-only">
        <caption>Cash by month</caption>
        <thead><tr><th>Month</th><th>Collected</th><th>Scheduled</th><th>Overdue</th></tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}><td>{b.longLabel}</td><td>{money(b.collected)}</td><td>{money(b.scheduled)}</td><td>{money(b.overdue)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

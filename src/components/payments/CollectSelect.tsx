"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Picks which month(s) the "To collect" card covers. Kept in the URL as ?collect=. */
export function CollectSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Period to collect"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value === "1") next.delete("collect");
        else next.set("collect", e.target.value);
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
      className="rounded-md border border-line-strong bg-white py-0.5 pl-2 pr-7 text-[12.5px] font-semibold uppercase tracking-wide text-ink outline-none focus:border-bronze focus:ring-2 focus:ring-bronze-light/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

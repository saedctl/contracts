"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Show: Monthly / All time" switch for the Payments summary. Monthly is the default. */
export function PeriodSelect({ value }: { value: "month" | "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-[13.5px] text-muted">
      Show
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "all") next.set("period", "all");
          else next.delete("period");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
        className="field-input w-auto py-1.5 pr-8 text-[14px] font-medium text-ink"
      >
        <option value="month">Monthly</option>
        <option value="all">All time</option>
      </select>
    </label>
  );
}

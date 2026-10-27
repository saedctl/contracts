import { integrationStatus } from "@/lib/config";

export function DemoBanner() {
  const simulated = integrationStatus().filter((i) => i.simulated).map((i) => i.name.replace(/ \(.*\)/, ""));
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] leading-5 text-amber-900">
      <strong className="font-semibold">Demo mode</strong> — {simulated.length ? `simulated: ${simulated.join(", ")}.` : "demo data."}{" "}
      Simulated signatures and emails are clearly marked and are never real transactions.
    </div>
  );
}

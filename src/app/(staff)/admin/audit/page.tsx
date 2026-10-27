import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { EVENT_LABELS } from "@/lib/services/audit";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireAdmin();
  const events = await (await getStore()).listAuditEvents({ limit: 300 });
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold sm:text-[32px]">Audit log</h1>
        <p className="mt-2 text-[15px] text-muted">Append-only record of every action on contracts, templates and staff accounts. Latest 300 events.</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="bg-paper/60 text-[12px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-5 py-3 font-medium">Event</th>
              <th className="px-5 py-3 font-medium">Actor</th>
              <th className="px-5 py-3 font-medium">Details</th>
              <th className="px-5 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(e.createdAt)}</td>
                <td className="px-5 py-3">
                  <p className="font-medium">{EVENT_LABELS[e.event] ?? e.event}</p>
                  {e.contractId && <Link href={`/contracts/${e.contractId}`} className="text-[12.5px] text-bronze-dark hover:underline">View contract</Link>}
                </td>
                <td className="px-5 py-3"><span className="capitalize text-muted">{e.actorType}</span>{e.actorLabel && <div className="text-[12.5px]">{e.actorLabel}</div>}</td>
                <td className="max-w-[320px] px-5 py-3"><code className="block break-all font-mono text-[11.5px] text-muted">{Object.keys(e.details).length ? JSON.stringify(e.details) : "—"}</code></td>
                <td className="whitespace-nowrap px-5 py-3 font-mono text-[12px] text-muted">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listContractsForStaff } from "@/lib/services/contracts";
import { productionBlockers } from "@/lib/config";
import { getStore } from "@/lib/db";
import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/types";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { Alert, ButtonLink, Card, StatusBadge, STATUS_LABELS, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Contracts" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = CONTRACT_STATUSES.includes(sp.status as ContractStatus) ? (sp.status as ContractStatus) : undefined;

  const [all, template] = await Promise.all([
    listContractsForStaff(user, { q: q || undefined }),
    (await getStore()).getActiveTemplate(),
  ]);
  const contracts = status ? all.filter((c) => c.status === status) : all;
  const counts = Object.fromEntries(CONTRACT_STATUSES.map((s) => [s, all.filter((c) => c.status === s).length])) as Record<ContractStatus, number>;
  const blockers = productionBlockers();
  const isAdmin = user.role === "admin";
  const qs = (s?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("status", s);
    const str = p.toString();
    return str ? `/dashboard?${str}` : "/dashboard";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{isAdmin ? "All contracts" : "Your contracts"}</p>
          <h1 className="mt-2 font-serif text-[28px] font-semibold leading-tight sm:text-[32px]">The Engineers Club — Contract Dashboard</h1>
        </div>
        <ButtonLink href="/contracts/new" className="px-5 py-3 text-[15px] shadow-pop">
          <span aria-hidden className="text-lg leading-none">+</span> Create New Contract
        </ButtonLink>
      </div>

      {sp.error === "forbidden" && <Alert tone="error">That page is only available to administrators.</Alert>}
      {blockers.length > 0 && (
        <Alert tone="warning">
          <strong>Setup incomplete — contracts can&apos;t be sent yet.</strong>
          <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </Alert>
      )}
      {!template && (
        <Alert tone="warning">
          No master contract template has been set up.{" "}
          {isAdmin ? <Link href="/admin/template" className="font-medium underline">Upload your agreement</Link> : "Ask an administrator to upload it."}
        </Alert>
      )}
      {template?.isSample && isAdmin && (
        <Alert>
          You&apos;re using the <strong>sample template</strong>, which contains no legal terms.{" "}
          <Link href="/admin/template" className="font-medium underline">Upload your approved agreement</Link> before going live.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:p-5">
          <form className="relative flex-1" role="search" action="/dashboard">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="q" className="sr-only">Search customers</label>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="q" name="q" defaultValue={q} placeholder="Search by name, email or reference" className="field-input pl-9" />
          </form>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Filter by status">
            <FilterChip href={qs()} active={!status} label="All" count={all.length} />
            {CONTRACT_STATUSES.map((s) => (
              <FilterChip key={s} href={qs(s)} active={status === s} label={STATUS_LABELS[s]} count={counts[s]} />
            ))}
          </div>
        </div>

        {contracts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-serif text-lg">{q || status ? "No contracts match your search." : "No contracts yet."}</p>
            <p className="mt-1 text-[14px] text-muted">{q || status ? "Try a different name, email or filter." : "Create your first contract — it takes under a minute."}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-[14px] md:table">
              <thead className="bg-paper/60 text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  {isAdmin && <th className="px-5 py-3 font-medium">Sales rep</th>}
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contracts.map((c) => (
                  <tr key={c.id} className="group relative transition hover:bg-paper/70">
                    <td className="px-5 py-3.5">
                      <Link href={`/contracts/${c.id}`} className="font-medium text-ink after:absolute after:inset-0 group-hover:underline">{c.customerName}</Link>
                      <div className="text-[13px] text-muted">{c.customerEmail} · {c.reference}</div>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">{formatMoney(c.amountPaid, c.currency)}</td>
                    <td className="px-5 py-3.5">{c.durationLabel}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={c.status} demo={c.isDemo} /></td>
                    {isAdmin && <td className="px-5 py-3.5 text-muted">{c.createdByName ?? "—"}</td>}
                    <td className="px-5 py-3.5 text-muted">{formatDateTime(c.updatedAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {c.status === "signed" && c.signedDocumentPath ? (
                        <a href={`/api/contracts/${c.id}/document?kind=signed`} className="relative z-10 text-[13px] font-medium text-bronze-dark hover:underline">Download</a>
                      ) : (
                        <Link href={`/contracts/${c.id}`} className="relative z-10 text-[13px] font-medium text-bronze-dark hover:underline">View</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile list */}
            <ul className="divide-y divide-line md:hidden">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Link href={`/contracts/${c.id}`} className="flex items-start justify-between gap-3 px-4 py-4 active:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.customerName}</p>
                      <p className="truncate text-[13px] text-muted">{formatMoney(c.amountPaid, c.currency)} · {c.durationLabel}</p>
                    </div>
                    <StatusBadge status={c.status} demo={c.isDemo} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
      <span className={cx("tabular-nums", active ? "text-white/70" : "text-muted/70")}>{count}</span>
    </Link>
  );
}

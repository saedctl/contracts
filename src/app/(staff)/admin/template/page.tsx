import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { activateTemplateAction } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { CompanySignatureForm } from "@/components/admin/CompanySignatureForm";
import { getCompanySignatureSetting } from "@/lib/services/document";
import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/types";
import { pickTemplate, tierLabel } from "@/lib/services/templates";
import { cx } from "@/components/ui";

export const metadata: Metadata = { title: "Contract template" };

export default async function TemplatePage({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  await requireAdmin();
  const tierParam = (await searchParams).tier;
  const tier: MembershipTier | null = MEMBERSHIP_TIERS.includes(tierParam as MembershipTier) ? (tierParam as MembershipTier) : null;
  const store = await getStore();
  const [versions, staff, companySig] = await Promise.all([store.listTemplateVersions(), store.listStaff(), getCompanySignatureSetting()]);
  const sigBytes = companySig?.imagePath ? await store.getFile(companySig.imagePath) : null;
  const sigImage = sigBytes ? `data:image/${companySig?.imageType === "jpg" ? "jpeg" : "png"};base64,${Buffer.from(sigBytes).toString("base64")}` : null;
  const activeAll = versions.filter((v) => v.isActive);
  // The version currently active for the selected tab, and what each tier actually uses.
  const active = activeAll.find((v) => v.tier === tier) ?? null;
  const inUse = (t: MembershipTier) => pickTemplate(activeAll, t);
  const shown = versions.filter((v) => v.tier === tier);
  const tabs: (MembershipTier | null)[] = [null, ...MEMBERSHIP_TIERS];
  const name = (id: string | null) => staff.find((s) => s.id === id)?.fullName ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold sm:text-[32px]">Master contract template</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">
          Upload or paste your approved membership agreement — one for each tier if their terms differ. Only the placeholders are filled in — the wording, clauses and policies stay exactly as written.
          Saving creates a new version; contracts already generated or signed keep the version they were created with.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template for">
          {tabs.map((t) => (
            <Link
              key={t ?? "all"}
              href={t ? `/admin/template?tier=${t}` : "/admin/template"}
              role="tab"
              aria-selected={t === tier}
              className={cx("rounded-lg border px-4 py-2 text-[14px] font-medium transition", t === tier ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink hover:border-ink/40")}
            >
              {tierLabel(t)}
            </Link>
          ))}
        </div>
        <div className="grid gap-2 text-[13.5px] text-muted sm:grid-cols-2">
          {MEMBERSHIP_TIERS.map((t) => {
            const u = inUse(t);
            return (
              <p key={t} className="rounded-lg border border-line bg-white px-3 py-2">
                <strong className="text-ink">{tierLabel(t)}</strong> contracts use:{" "}
                {u ? <>v{u.version} · {u.title} <span className="text-muted">({u.tier ? "its own template" : "the All tiers template"})</span></> : <span className="font-medium text-red-800">no template — contracts can&apos;t be created</span>}
              </p>
            );
          })}
        </div>
        <p className="text-[13.5px] text-muted">
          {tier
            ? `You're editing the ${tierLabel(tier)} template. It's used for every ${tierLabel(tier)} contract.`
            : "You're editing the All tiers template. It's used for any tier that doesn't have its own template."}
        </p>
      </div>

      <TemplateEditor
        key={tier ?? "all"}
        tier={tier}
        initialTitle={active && !active.isSample ? active.title : tier ? `${tierLabel(tier)} Membership Agreement` : "Membership Agreement"}
        initialBody={active && !active.isSample ? active.body : ""}
        activeVersion={active?.version ?? null}
        sampleBody={active?.isSample ? active.body : null}
        companySignatory={companySig?.enabled ? { name: companySig.name, role: companySig.role, image: sigImage } : null}
        legalName={BRAND.legalName}
      />

      <CompanySignatureForm initial={{ enabled: companySig?.enabled ?? false, name: companySig?.name ?? "", role: companySig?.role || `For ${BRAND.name}`, image: sigImage }} />

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 font-serif text-lg font-semibold sm:px-6">Version history — {tierLabel(tier)}</h2>
        <ul className="divide-y divide-line">
          {shown.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0 text-[14px]">
                <p className="font-medium">
                  v{v.version} · {v.title}
                  {v.isActive && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-800 ring-1 ring-emerald-200">Active</span>}
                  {v.isSample && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-800 ring-1 ring-amber-200">Sample</span>}
                </p>
                <p className="text-[13px] text-muted">{formatDateTime(v.createdAt)} · {name(v.createdBy)}{v.notes ? ` · ${v.notes}` : ""}</p>
                <p className="truncate font-mono text-[11.5px] text-muted">sha256 {v.bodySha256}</p>
              </div>
              {!v.isActive && (
                <form action={activateTemplateAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-paper">Make active</button>
                </form>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="px-6 py-8 text-[14px] text-muted">No {tierLabel(tier)} versions yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

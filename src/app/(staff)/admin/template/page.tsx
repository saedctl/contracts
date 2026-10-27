import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { activateTemplateAction } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui";
import { TemplateEditor } from "@/components/admin/TemplateEditor";

export const metadata: Metadata = { title: "Contract template" };

export default async function TemplatePage() {
  await requireAdmin();
  const store = await getStore();
  const [versions, staff] = await Promise.all([store.listTemplateVersions(), store.listStaff()]);
  const active = versions.find((v) => v.isActive) ?? null;
  const name = (id: string | null) => staff.find((s) => s.id === id)?.fullName ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 font-serif text-[28px] font-semibold sm:text-[32px]">Master contract template</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">
          Upload or paste your approved membership agreement once. Only the placeholders are filled in — the wording, clauses and policies stay exactly as written.
          Saving creates a new version; contracts already generated or signed keep the version they were created with.
        </p>
      </div>

      <TemplateEditor
        initialTitle={active && !active.isSample ? active.title : "Membership Agreement"}
        initialBody={active && !active.isSample ? active.body : ""}
        activeVersion={active?.version ?? null}
        sampleBody={active?.isSample ? active.body : null}
      />

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 font-serif text-lg font-semibold sm:px-6">Version history</h2>
        <ul className="divide-y divide-line">
          {versions.map((v) => (
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
          {versions.length === 0 && <li className="px-6 py-8 text-[14px] text-muted">No versions yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { saveTemplateAction, type ActionResult } from "@/app/actions/admin";
import { checkTemplate, PLACEHOLDERS, renderTemplate } from "@/lib/template";
import { Alert, Button, Card, Field, Spinner, cx } from "@/components/ui";
import { ContractDocument } from "@/components/ContractDocument";

const EXAMPLES = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.example]));

export function TemplateEditor({ initialTitle, initialBody, activeVersion, sampleBody }: { initialTitle: string; initialBody: string; activeVersion: number | null; sampleBody: string | null }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTemplateAction, {});
  const [body, setBody] = useState(initialBody);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const check = useMemo(() => checkTemplate(body), [body]);
  const blocks = useMemo(() => (tab === "preview" ? renderTemplate(body, EXAMPLES) : []), [tab, body]);

  function insert(key: string) {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/template/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBody(data.body);
      setTab("edit");
      setImportMsg({ tone: "info", text: `Imported ${file.name}. Check the text below, then replace customer details with placeholders (e.g. {{customer_name}}) before saving.${data.warnings?.length ? ` Notes: ${data.warnings.join("; ")}` : ""}` });
    } catch (e) {
      setImportMsg({ tone: "error", text: (e as Error).message || "Import failed." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="Version name" htmlFor="title" className="flex-1">
            <input id="title" name="title" defaultValue={initialTitle} className="field-input" required maxLength={120} />
          </Field>
          <label className={cx("inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong bg-white px-4 py-2.5 text-[15px] font-medium hover:bg-paper", importing && "opacity-60")}>
            {importing && <Spinner />} Upload .docx / .txt
            <input type="file" accept=".docx,.txt,.md" className="sr-only" disabled={importing} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          </label>
        </div>
        {importMsg && <Alert tone={importMsg.tone === "error" ? "error" : "info"} className="mt-4">{importMsg.text}</Alert>}
        {sampleBody !== null && !body && (
          <Alert className="mt-4">
            The sample template is active. Upload your approved agreement (Word .docx works best) or paste it below.{" "}
            <button type="button" className="font-medium underline" onClick={() => setBody(sampleBody)}>Start from the sample layout</button>
          </Alert>
        )}

        <div role="tablist" className="mt-5 inline-flex rounded-lg border border-line-strong bg-white p-1">
          {(["edit", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("rounded-md px-3 py-1 text-[14px] font-medium", tab === t ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {t === "preview" ? "Preview with example data" : "Edit"}
            </button>
          ))}
        </div>
        <textarea
          ref={area}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          className={cx("field-input mt-3 min-h-[520px] font-mono text-[13px] leading-6", tab !== "edit" && "hidden")}
          placeholder={"# Membership Agreement\n\nThis agreement is between {{company_name}} and {{customer_name}}…"}
        />
        {tab === "preview" && (
          <div className="mt-3 max-h-[640px] overflow-y-auto rounded-xl border border-line bg-white px-5 py-8 sm:px-10">
            {body.trim() ? <ContractDocument blocks={blocks} highlight /> : <p className="text-muted">Nothing to preview yet.</p>}
          </div>
        )}

        <Field label="Change notes (optional)" htmlFor="notes" className="mt-5">
          <input id="notes" name="notes" className="field-input" maxLength={300} placeholder="e.g. Updated refund policy wording approved 1 Nov" />
        </Field>

        {check.unknown.length > 0 && (
          <Alert tone="error" className="mt-5">Unknown placeholder{check.unknown.length > 1 ? "s" : ""}: {check.unknown.map((k) => `{{${k}}}`).join(", ")}. Use only the placeholders listed on the right.</Alert>
        )}
        {check.unfilled.length > 0 && (
          <Alert tone="error" className="mt-5">Fill in these items before saving — they would appear in customers&apos; contracts as written: {check.unfilled.join(", ")}</Alert>
        )}
        {body.trim() && check.missingRecommended.length > 0 && check.unknown.length === 0 && (
          <Alert tone="warning" className="mt-5">Not used yet: {check.missingRecommended.map((k) => `{{${k}}}`).join(", ")}. Saving is still allowed.</Alert>
        )}
        {state.error && <Alert tone="error" className="mt-5">{state.error}</Alert>}
        {state.ok && <Alert tone="success" className="mt-5">{state.message}</Alert>}

        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">{activeVersion ? `Currently active: v${activeVersion}. ` : ""}Saving creates v{(activeVersion ?? 0) + 1} and makes it active.</p>
          <Button type="submit" disabled={pending || !body.trim() || check.unknown.length > 0 || check.unfilled.length > 0}>{pending && <Spinner />} Save new version</Button>
        </div>
      </Card>

      <aside className="space-y-4">
        <Card className="p-5">
          <h3 className="font-serif text-base font-semibold">Placeholders</h3>
          <p className="mt-1 text-[13px] text-muted">Click to insert at the cursor.</p>
          <ul className="mt-3 space-y-1">
            {PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => insert(p.key)} className={cx("w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-paper", check.used.includes(p.key) && "bg-bronze-wash")}>
                  <code className="block font-mono text-[12px] text-bronze-dark">{`{{${p.key}}}`}</code>
                  <span className="text-[12.5px] text-muted">{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 text-[13px] leading-6 text-muted">
          <h3 className="font-serif text-base font-semibold text-ink">Formatting</h3>
          <ul className="mt-2 space-y-0.5 font-mono text-[12px]">
            <li># Heading</li>
            <li>## Sub-heading</li>
            <li>**bold** · *italic*</li>
            <li>- bullet point</li>
            <li>--- divider</li>
          </ul>
          <p className="mt-2">Leave a blank line between paragraphs.</p>
        </Card>
      </aside>
    </form>
  );
}

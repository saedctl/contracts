"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Spinner } from "@/components/ui";

export function CompanySignatureForm({ initial }: { initial: { enabled: boolean; name: string; role: string; image: string | null } }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [preview, setPreview] = useState<string | null>(initial.image);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/company-signature", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ tone: "success", text: "Saved. New contracts will include this signature; contracts already issued are unchanged." });
      setFileName(null);
      router.refresh();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message || "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="company-signature" className="p-5 sm:p-6">
      <h2 className="font-serif text-lg font-semibold">Company signature</h2>
      <p className="mt-1 text-[14px] text-muted">Signed for the company automatically on every new contract (all tiers), dated the day the contract is issued. Upload an image of the signature, or leave it blank to show the name in italics.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[#141414]" />
          Apply a company signature to new contracts
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signed by" htmlFor="sig-name" hint="e.g. Saed Farah">
            <input id="sig-name" name="name" defaultValue={initial.name} className="field-input" maxLength={80} disabled={!enabled} />
          </Field>
          <Field label="Signing as" htmlFor="sig-role" hint="Shown under the name">
            <input id="sig-role" name="role" defaultValue={initial.role} className="field-input" maxLength={80} disabled={!enabled} placeholder="For The Engineers Club" />
          </Field>
        </div>
        <Field label="Signature image (optional)" htmlFor="sig-image" hint="PNG or JPEG, under 1 MB. A transparent PNG looks best. Without an image, the name is shown in italics.">
          <div className="flex flex-wrap items-center gap-4">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Company signature" className="h-14 rounded-lg border border-line bg-white p-1" />
            )}
            <label className={enabled ? "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-white px-4 py-2 text-[14px] font-medium hover:border-ink/40" : "inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 text-[14px] text-muted"}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
              {preview ? "Replace signature image" : "Upload signature image"}
              <input id="sig-image" name="image" type="file" accept="image/png,image/jpeg" disabled={!enabled} className="sr-only" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPreview(URL.createObjectURL(f));
                  setFileName(f.name);
                }
              }} />
            </label>
            {fileName && <span className="text-[13px] text-muted">{fileName} — click Save to apply</span>}
            {initial.image && (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" name="removeImage" className="accent-[#141414]" /> Remove current image
              </label>
            )}
          </div>
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" disabled={busy}>{busy && <Spinner />} Save company signature</Button>
      </form>
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Spinner } from "@/components/ui";

/** Administrator-only permanent deletion, confirmed by typing the contract reference. */
export function AdminDeleteContract({ id, reference, status }: { id: string; reference: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signed = status === "signed";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${id}/admin-delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push("/dashboard?deleted=" + encodeURIComponent(reference));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="border-red-200 p-5 sm:p-6">
      <h2 className="font-serif text-lg font-semibold text-red-900">Delete contract</h2>
      <p className="mt-1 text-[14px] text-muted">Administrators only. Permanently removes this contract and its PDFs. The deletion itself stays in the audit log.</p>
      {!open ? (
        <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>Delete contract…</Button>
      ) : (
        <div className="mt-4 space-y-3">
          {signed && (
            <Alert tone="warning">
              This contract is <strong>signed</strong>. Deleting it removes your signed copy and its audit trail from this app. Download the signed PDF first if you may need it as evidence later.
            </Alert>
          )}
          <label className="block text-[14px]">
            Type <strong className="font-mono">{reference}</strong> to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field-input mt-1.5 font-mono" autoComplete="off" />
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={remove} disabled={busy || confirm.trim().toUpperCase() !== reference.toUpperCase()}>
              {busy && <Spinner />} Permanently delete
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setConfirm(""); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

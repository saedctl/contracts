"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContractStatus } from "@/lib/types";
import { Alert, Button, Spinner } from "@/components/ui";

type Action = "send" | "resend" | "link" | "refresh" | "delete";

export function ContractActions({ id, status, provider, hasSigned }: { id: string; status: ContractStatus; provider: "dropbox_sign" | "demo"; hasSigned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function run(action: Action, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/contracts/${id}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (action === "link") {
        setLink(data.url);
        try {
          await navigator.clipboard.writeText(data.url);
          setMsg({ tone: "success", text: "Signing link copied to clipboard. Only share it with the customer." });
        } catch {
          setMsg({ tone: "success", text: "Here's the signing link. Only share it with the customer." });
        }
        return;
      }
      if (action === "delete") {
        router.push("/dashboard");
        return;
      }
      setMsg({
        tone: "success",
        text: { send: "Sent for signature.", resend: "A fresh signing link has been emailed. Previous links no longer work.", refresh: "Status refreshed from Dropbox Sign." }[action],
      });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const awaiting = status === "sent" || status === "viewed";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <>
            <Button onClick={() => run("send")} disabled={!!busy}>{busy === "send" && <Spinner />} Send for signature</Button>
            <Button variant="danger" onClick={() => run("delete", "Delete this draft? This can't be undone.")} disabled={!!busy}>Delete draft</Button>
          </>
        )}
        {(awaiting || status === "expired") && (
          <Button variant={status === "expired" ? "primary" : "secondary"} onClick={() => run("resend", "Email the customer a fresh signing link? Any previous link will stop working.")} disabled={!!busy}>
            {busy === "resend" && <Spinner />} {status === "expired" ? "Resend with new link" : "Resend signing request"}
          </Button>
        )}
        {awaiting && (
          <Button variant="secondary" onClick={() => run("link")} disabled={!!busy}>{busy === "link" && <Spinner />} Copy signing link</Button>
        )}
        {provider === "dropbox_sign" && (awaiting || (status === "signed" && !hasSigned)) && (
          <Button variant="ghost" onClick={() => run("refresh")} disabled={!!busy}>{busy === "refresh" && <Spinner />} Refresh status</Button>
        )}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {link && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="field-input font-mono text-[13px]" aria-label="Signing link" />
      )}
    </div>
  );
}

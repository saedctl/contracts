"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Spinner } from "@/components/ui";

/**
 * Hosted Dropbox Sign mode: signing happens on Dropbox Sign's site via the link it emailed to
 * the customer. This panel explains that and lets the customer ask for the email again.
 */
export function HostedSigningPanel({ token, email }: { token: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const viewedSent = useRef(false);

  useEffect(() => {
    if (viewedSent.current) return;
    viewedSent.current = true;
    void fetch(`/api/sign/${token}/viewed`, { method: "POST" });
  }, [token]);

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sign/${token}/remind`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setMsg({ tone: "success", text: `Sent. Look for an email from Dropbox Sign at ${email} in the next few minutes.` });
    } catch (e) {
      const text = (e as Error).message;
      // The 15-minute limit isn't a failure: the email was sent recently.
      setMsg({ tone: text.startsWith("We've just sent it") ? "success" : "error", text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-8">
      <h2 className="font-serif text-xl font-semibold">Sign your agreement</h2>
      <ol className="mt-4 space-y-3 text-[15px] leading-6">
        <li className="flex gap-3"><span className="font-semibold text-bronze">1.</span><span>Open the email from <strong>Dropbox Sign</strong> sent to <strong>{email}</strong>. The subject is &ldquo;Your Engineers Club Membership Agreement&rdquo;.</span></li>
        <li className="flex gap-3"><span className="font-semibold text-bronze">2.</span><span>Click <strong>Review &amp; sign</strong> in that email. You&apos;ll sign securely on Dropbox Sign by drawing, typing or uploading your signature.</span></li>
        <li className="flex gap-3"><span className="font-semibold text-bronze">3.</span><span>Once you&apos;ve signed, we&apos;ll email you a copy of the completed agreement, and this page will show it as signed.</span></li>
      </ol>
      <p className="mt-4 text-[14px] text-muted">Can&apos;t find it? Check your spam or promotions folder, or send it again:</p>
      {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      <Button onClick={resend} disabled={busy} variant="secondary" className="mt-3">
        {busy && <Spinner />} Send me the signing email again
      </Button>
    </Card>
  );
}

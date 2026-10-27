"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, LockIcon, Spinner } from "@/components/ui";
import { SignaturePad, type DemoSignatureValue } from "./SignaturePad";

type Start = { mode: "dropbox_sign"; signUrl: string; clientId: string; testMode: boolean } | { mode: "demo" };

export function SigningPanel({ token, consentStatement, customerName, mode }: { token: string; consentStatement: string; customerName: string; mode: "dropbox_sign" | "demo" }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoReady, setDemoReady] = useState(false);
  const [sig, setSig] = useState<DemoSignatureValue>(null);
  const viewedSent = useRef(false);
  const onSig = useCallback((v: DemoSignatureValue) => setSig(v), []);

  useEffect(() => {
    if (viewedSent.current) return;
    viewedSent.current = true;
    void fetch(`/api/sign/${token}/viewed`, { method: "POST" });
  }, [token]);

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/sign/${token}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data;
  }

  async function begin() {
    if (!consent) return setError("Please tick the box to confirm you agree to sign electronically.");
    setBusy(true);
    setError(null);
    try {
      const start = (await post("start", { consent: true })) as Start;
      if (start.mode === "demo") {
        setDemoReady(true);
        return;
      }
      const { default: HelloSign } = await import("hellosign-embedded");
      const client = new HelloSign({ clientId: start.clientId });
      client.on("sign", async () => {
        // The provider's webhook is the source of truth; this just moves the page to "finalising".
        await post("complete").catch(() => undefined);
        router.refresh();
      });
      client.on("decline", () => setTimeout(() => router.refresh(), 2500));
      client.on("error", () => setError("The signing panel reported an error. Please refresh the page and try again."));
      client.open(start.signUrl, { skipDomainVerification: start.testMode, testMode: start.testMode, allowCancel: true, locale: "en_US" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demoSign() {
    if (!sig) return setError("Please add your signature first.");
    setBusy(true);
    setError(null);
    try {
      await post("demo-sign", sig);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-8">
      <h2 className="font-serif text-xl font-semibold">Sign your agreement</h2>
      {!demoReady ? (
        <>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-4 text-[15px] leading-6">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(null); }} className="mt-1 size-4 shrink-0 accent-[#141414]" />
            <span>{consentStatement}</span>
          </label>
          {error && <Alert tone="error" className="mt-4">{error}</Alert>}
          <Button onClick={begin} disabled={busy} className="mt-5 w-full py-3.5 text-[16px]">
            {busy && <Spinner />} {mode === "demo" ? "Continue" : "Sign Contract"}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-muted">
            <LockIcon /> {mode === "demo" ? "Demo — simulated signing, not legally binding" : "Secure signing by Dropbox Sign. You can draw, type or upload your signature."}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-[14px] text-muted">Draw, type or upload your signature. <strong className="text-red-800">Demo only — this is not a legally binding signature.</strong></p>
          <div className="mt-5"><SignaturePad defaultName={customerName} onChange={onSig} /></div>
          {error && <Alert tone="error" className="mt-4">{error}</Alert>}
          <Button onClick={demoSign} disabled={busy || !sig} className="mt-5 w-full py-3.5 text-[16px]">
            {busy && <Spinner />} Sign Contract
          </Button>
        </>
      )}
    </Card>
  );
}

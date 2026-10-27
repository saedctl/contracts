"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { calculateEndDate, describeTerm, DURATION_OPTIONS } from "@/lib/dates";
import { contractInputSchema, zodFieldErrors, type FieldErrors } from "@/lib/validation";
import type { RenderedBlock } from "@/lib/template";
import { Alert, Button, ButtonLink, Card, Field, Spinner, cx } from "@/components/ui";
import { ContractDocument } from "@/components/ContractDocument";

type Step = "details" | "review" | "sent";
type Values = {
  customerName: string; customerEmail: string; customerPhone: string;
  duration: string; startDate: string; endDate: string;
  amountPaid: string; currency: "GBP" | "USD"; paymentStatus: "paid_in_full" | "deposit_paid" | "payment_plan";
  paymentSchedule: string; outstandingBalance: string;
};
type Preview = { blocks: RenderedBlock[]; templateVersion: number; templateTitle: string; isSample: boolean };
type Sent = { id: string; reference: string; customerEmail: string; emailSimulated: boolean; demo: boolean };

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Enter details" },
  { key: "review", label: "Review contract" },
  { key: "sent", label: "Send for signature" },
];

export function NewContractFlow({ today }: { today: string }) {
  const [step, setStep] = useState<Step>("details");
  const [v, setV] = useState<Values>({
    customerName: "", customerEmail: "", customerPhone: "",
    duration: "", startDate: today, endDate: "",
    amountPaid: "", currency: "GBP", paymentStatus: "paid_in_full", paymentSchedule: "", outstandingBalance: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; contractId?: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | "pdf" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setV((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-calculate the end date from start + duration. Editing the end date by hand
      // switches the duration to "Custom" so the contract always describes the real term.
      if ((key === "duration" || key === "startDate") && next.duration && next.duration !== "custom" && next.startDate) {
        next.endDate = calculateEndDate(next.startDate, Number(next.duration));
      }
      if (key === "endDate" && prev.duration !== "custom" && value !== calculateEndDate(prev.startDate, Number(prev.duration))) {
        next.duration = "custom";
      }
      if (key === "paymentStatus" && value === "paid_in_full") {
        next.outstandingBalance = "";
        next.paymentSchedule = "";
      }
      return next;
    });
    setErrors((e) => {
      if (!e[key]) return e;
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
    setPreview(null);
  };

  const parsed = () => {
    const result = contractInputSchema.safeParse({
      ...v,
      amountPaid: v.amountPaid === "" ? undefined : v.amountPaid,
      outstandingBalance: v.outstandingBalance === "" ? 0 : v.outstandingBalance,
    });
    if (!result.success) {
      const fe = zodFieldErrors(result.error);
      if (v.amountPaid === "") fe.amountPaid = "Enter the amount paid";
      setErrors(fe);
      setFormError({ message: "Please check the highlighted fields." });
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return null;
    }
    setErrors({});
    setFormError(null);
    return result.data;
  };

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    return { res, data };
  }

  function handleFailure(data: { error?: string; fieldErrors?: FieldErrors; contractId?: string } | null) {
    if (data?.fieldErrors) {
      setErrors(data.fieldErrors);
      setStep("details");
    }
    setFormError({ message: data?.error ?? "Something went wrong. Please try again.", contractId: data?.contractId });
  }

  async function doPreview() {
    const input = parsed();
    if (!input) return;
    setBusy("preview");
    try {
      const { res, data } = await post("/api/contracts/preview", { input });
      if (!res.ok) return handleFailure(data);
      setPreview(data);
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      handleFailure(null);
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    const input = parsed();
    if (!input) return;
    setBusy("pdf");
    // Open the tab synchronously so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/contracts/preview?format=pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      if (!res.ok) {
        tab?.close();
        return handleFailure(await res.json().catch(() => null));
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } finally {
      setBusy(null);
    }
  }

  async function doSend() {
    const input = parsed();
    if (!input) return;
    setBusy("send");
    try {
      const { res, data } = await post("/api/contracts", { input, send: true });
      if (!res.ok) return handleFailure(data);
      setSent(data);
      setStep("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      handleFailure(null);
    } finally {
      setBusy(null);
    }
  }

  const termHint = useMemo(() => {
    if (!v.startDate || !v.endDate || v.endDate < v.startDate) return null;
    return describeTerm(v.startDate, v.endDate);
  }, [v.startDate, v.endDate]);

  const showBalance = v.paymentStatus !== "paid_in_full";
  const symbol = v.currency === "GBP" ? "£" : "$";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link href="/dashboard" className="text-[14px] text-muted hover:text-ink">← Back to contracts</Link>
        <h1 className="mt-3 font-serif text-[28px] font-semibold sm:text-[32px]">Create New Contract</h1>
        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.key === step);
            const state = i < idx ? "done" : i === idx ? "current" : "todo";
            return (
              <li key={s.key} aria-current={state === "current" ? "step" : undefined} className="flex flex-col gap-2">
                <span className={cx("h-1 rounded-full", state === "todo" ? "bg-line" : "bg-bronze")} />
                <span className={cx("text-[13px] font-medium", state === "todo" ? "text-muted" : "text-ink")}>
                  <span className="mr-1 text-bronze">{i + 1}.</span>{s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {formError && (
        <Alert tone="error" className="mb-6">
          {formError.message}
          {formError.contractId && (
            <> The contract was saved as a draft — <Link className="font-medium underline" href={`/contracts/${formError.contractId}`}>open it to retry</Link>.</>
          )}
        </Alert>
      )}

      {step === "details" && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void doPreview();
          }}
          className="space-y-6"
        >
          <Card className="p-5 sm:p-7">
            <h2 className="font-serif text-lg font-semibold">Customer details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="customerName" required error={errors.customerName} className="sm:col-span-2">
                <input id="customerName" className="field-input" autoComplete="off" autoFocus value={v.customerName} onChange={(e) => set("customerName", e.target.value)} aria-invalid={!!errors.customerName} placeholder="e.g. Sarah Ahmed" />
              </Field>
              <Field label="Email address" htmlFor="customerEmail" required error={errors.customerEmail} hint="The signing link is sent here.">
                <input id="customerEmail" type="email" inputMode="email" className="field-input" autoComplete="off" value={v.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} aria-invalid={!!errors.customerEmail} placeholder="name@example.com" />
              </Field>
              <Field label="Phone number" htmlFor="customerPhone" required error={errors.customerPhone}>
                <input id="customerPhone" type="tel" inputMode="tel" className="field-input" autoComplete="off" value={v.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} aria-invalid={!!errors.customerPhone} placeholder="+44 7700 900123" />
              </Field>
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="font-serif text-lg font-semibold">Membership details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <Field label="Membership duration" htmlFor="duration" required error={errors.duration}>
                <select id="duration" className="field-input" value={v.duration} onChange={(e) => set("duration", e.target.value)} aria-invalid={!!errors.duration}>
                  <option value="" disabled>Choose…</option>
                  {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Start date" htmlFor="startDate" required error={errors.startDate}>
                <input id="startDate" type="date" className="field-input" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!errors.startDate} />
              </Field>
              <Field label="End date" htmlFor="endDate" required error={errors.endDate} hint={termHint ? `${termHint}${v.duration !== "custom" ? " · auto-calculated" : ""}` : "Calculated from the duration"}>
                <input id="endDate" type="date" className="field-input" min={v.startDate} value={v.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!errors.endDate} />
              </Field>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              <Field label="Amount paid" htmlFor="amountPaid" required error={errors.amountPaid} className="sm:col-span-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{symbol}</span>
                    <input id="amountPaid" inputMode="decimal" className="field-input pl-8 tabular-nums" value={v.amountPaid} onChange={(e) => set("amountPaid", e.target.value.replace(/[^\d.]/g, ""))} aria-invalid={!!errors.amountPaid} placeholder="0.00" />
                  </div>
                  <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-lg border border-line-strong bg-white p-1">
                    {(["GBP", "USD"] as const).map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={v.currency === c} onClick={() => set("currency", c)} className={cx("rounded-md px-3 text-[14px] font-medium transition", v.currency === c ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Payment status" htmlFor="paymentStatus" required error={errors.paymentStatus}>
                <select id="paymentStatus" className="field-input" value={v.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value as Values["paymentStatus"])}>
                  <option value="paid_in_full">Paid in Full</option>
                  <option value="deposit_paid">Deposit Paid</option>
                  <option value="payment_plan">Payment Plan</option>
                </select>
              </Field>
            </div>

            {showBalance && (
              <div className="mt-5 grid gap-5 rounded-xl bg-paper p-4 sm:grid-cols-3">
                <Field label="Outstanding balance" htmlFor="outstandingBalance" error={errors.outstandingBalance} hint="Optional">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{symbol}</span>
                    <input id="outstandingBalance" inputMode="decimal" className="field-input pl-8 tabular-nums" value={v.outstandingBalance} onChange={(e) => set("outstandingBalance", e.target.value.replace(/[^\d.]/g, ""))} aria-invalid={!!errors.outstandingBalance} placeholder="0.00" />
                  </div>
                </Field>
                <Field label="Payment schedule" htmlFor="paymentSchedule" error={errors.paymentSchedule} hint="Optional — e.g. 3 monthly payments of £200 from 1 Dec" className="sm:col-span-2">
                  <input id="paymentSchedule" className="field-input" value={v.paymentSchedule} onChange={(e) => set("paymentSchedule", e.target.value)} aria-invalid={!!errors.paymentSchedule} />
                </Field>
              </div>
            )}
          </Card>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="submit" variant="secondary" disabled={!!busy} className="py-3">
              {busy === "preview" && <Spinner />} Preview Contract
            </Button>
            <Button type="button" onClick={doSend} disabled={!!busy} className="py-3">
              {busy === "send" && <Spinner />} {busy === "send" ? "Generating & sending…" : "Generate & Send for Signature"}
            </Button>
          </div>
        </form>
      )}

      {step === "review" && preview && (
        <div className="space-y-6">
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="text-[14px] leading-6">
              <p className="font-medium">{v.customerName} · <span className="text-muted">{v.customerEmail}</span></p>
              <p className="text-muted">Template v{preview.templateVersion} · Highlighted text is filled in from the details you entered.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("details")} disabled={!!busy}>Edit details</Button>
              <Button variant="secondary" onClick={doPdf} disabled={!!busy}>{busy === "pdf" && <Spinner />} PDF</Button>
            </div>
          </Card>
          {preview.isSample && <Alert tone="warning">This preview uses the sample template, which contains no legal terms.</Alert>}
          <Card className="px-5 py-8 sm:px-12 sm:py-12">
            <ContractDocument blocks={preview.blocks} highlight />
            <div className="mt-10 rounded-xl border border-dashed border-line-strong p-5 text-[14px] text-muted">
              A signature page is added at the end for the customer to sign electronically.
            </div>
          </Card>
          <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-line bg-white/95 p-3 shadow-pop backdrop-blur sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setStep("details")} disabled={!!busy}>Back</Button>
            <Button onClick={doSend} disabled={!!busy} className="py-3">
              {busy === "send" && <Spinner />} {busy === "send" ? "Generating & sending…" : "Generate & Send for Signature"}
            </Button>
          </div>
        </div>
      )}

      {step === "sent" && sent && (
        <Card className="p-8 text-center sm:p-12">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5L20 7" /></svg>
          </div>
          <h2 className="mt-5 font-serif text-2xl font-semibold">{sent.emailSimulated ? "Contract ready (demo)" : "Sent for signature"}</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-muted">
            {sent.emailSimulated ? (
              <>Demo mode: no email was actually sent to <strong className="text-ink">{sent.customerEmail}</strong>. Open the contract to copy the signing link and try the signing flow.</>
            ) : (
              <>A secure signing link has been emailed to <strong className="text-ink">{sent.customerEmail}</strong>. The status will update automatically when they sign.</>
            )}
          </p>
          <p className="mt-3 text-[13px] text-muted">Reference {sent.reference}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={`/contracts/${sent.id}`} variant="secondary">View contract</ButtonLink>
            <Button onClick={() => { setV((p) => ({ ...p, customerName: "", customerEmail: "", customerPhone: "", amountPaid: "", paymentSchedule: "", outstandingBalance: "" })); setSent(null); setPreview(null); setStep("details"); }}>+ Create another</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { resolveSigningToken, getContractTemplateBody, CONSENT_STATEMENT } from "@/lib/services/contracts";
import { renderTemplate } from "@/lib/template";
import { PAYMENT_STATUS_LABELS } from "@/lib/types";
import { formatLongDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui";
import { ContractDocument } from "@/components/ContractDocument";
import { SigningPanel } from "@/components/sign/SigningPanel";
import { AutoRefresh } from "@/components/sign/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your membership agreement", robots: { index: false, follow: false } };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await resolveSigningToken(token);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-white/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <a href={BRAND.website} className="font-serif text-[12px] font-medium uppercase tracking-[0.3em] text-bronze">{BRAND.name}</a>
          <span className="text-[13px] text-muted">Membership agreement</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {s.state === "invalid" && (
          <Message title="This link isn't valid">
            The signing link may have been replaced by a newer one, or copied incorrectly. Please use the most recent email from {BRAND.name}, or reply to it and we&apos;ll send a new link.
          </Message>
        )}
        {s.state === "expired" && (
          <Message title="This signing link has expired">Please contact the {BRAND.name} team and we&apos;ll send you a new link.</Message>
        )}
        {s.state === "declined" && <Message title="Agreement declined">You declined to sign this agreement. If this was a mistake, please contact the {BRAND.name} team.</Message>}
        {s.state === "finalising" && (
          <Message title="Thank you — finalising your agreement">
            We&apos;re waiting for the e-signature provider to confirm your signature. This usually takes a few seconds; you&apos;ll also receive a copy by email.
            <AutoRefresh seconds={5} />
          </Message>
        )}
        {s.state === "signed" && (
          <Message title="Your agreement is signed">
            Thank you, {s.contract.customerName}. {s.contract.isDemo ? "This was a demo — no legally binding signature was made." : "A copy of the completed agreement has been emailed to you."}
            {s.contract.signedDocumentPath && (
              <a href={`/api/sign/${token}/document`} target="_blank" className="mt-5 inline-flex rounded-lg bg-ink px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ink-soft">Download signed copy</a>
            )}
          </Message>
        )}
        {s.state === "ready" && (await Ready({ token, contract: s.contract }))}
      </main>
      <footer className="border-t border-line py-6 text-center text-[12px] leading-5 text-muted">
        <p className="mx-auto max-w-xl px-4">
          {BRAND.legalName} processes the details in this agreement to provide your membership, in line with UK GDPR. Electronic signing is provided by {s.state !== "invalid" && s.contract.esignProvider === "demo" ? "a demo simulator" : "Dropbox Sign"}.
        </p>
        <p className="mt-1">{BRAND.name} · <a href={BRAND.website} className="hover:text-ink">{BRAND.websiteLabel}</a></p>
      </footer>
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center sm:p-10">
      <h1 className="font-serif text-2xl font-semibold">{title}</h1>
      <div className="mt-3 flex flex-col items-center text-[15px] leading-6 text-muted">{children}</div>
    </Card>
  );
}

async function Ready({ token, contract: c }: { token: string; contract: import("@/lib/types").Contract }) {
  const { body } = await getContractTemplateBody(c);
  const blocks = renderTemplate(body, c.fieldValues);
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-3 font-serif text-[28px] font-semibold leading-tight sm:text-[34px]">Hi {c.customerName.split(" ")[0]}, here&apos;s your membership agreement</h1>
        <p className="mx-auto mt-3 max-w-lg text-[16px] leading-7 text-muted">Please read it carefully. When you&apos;re ready, sign at the bottom of the page — it takes less than a minute.</p>
      </div>

      {c.isDemo && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[14px] text-red-900">
          <strong>Demo mode.</strong> This is a test agreement. Signing here is simulated and is not legally binding.
        </div>
      )}

      <Card className="grid grid-cols-2 gap-4 p-5 text-[14px] sm:grid-cols-4 sm:p-6">
        <Summary label="Membership" value={c.durationLabel} />
        <Summary label="Starts" value={formatLongDate(c.startDate)} />
        <Summary label="Ends" value={formatLongDate(c.endDate)} />
        <Summary label="Amount paid" value={`${formatMoney(c.amountPaid, c.currency)}`} sub={PAYMENT_STATUS_LABELS[c.paymentStatus]} />
      </Card>

      <Card className="px-5 py-8 sm:px-12 sm:py-12">
        <ContractDocument blocks={blocks} />
        <div className="mt-8 flex justify-end border-t border-line pt-5">
          <a href={`/api/sign/${token}/document`} target="_blank" className="text-[14px] font-medium text-bronze-dark hover:underline">Download PDF ↓</a>
        </div>
      </Card>

      <SigningPanel token={token} consentStatement={CONSENT_STATEMENT} customerName={c.customerName} mode={c.esignProvider} />
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
      {sub && <p className="text-[12.5px] text-muted">{sub}</p>}
    </div>
  );
}

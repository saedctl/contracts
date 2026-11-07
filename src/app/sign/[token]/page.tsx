import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { resolveSigningToken, CONSENT_STATEMENT, isHostedSigning } from "@/lib/services/contracts";
import { contractDoc } from "@/lib/services/document";
import type { Contract } from "@/lib/types";
import { formatLongDate } from "@/lib/utils";
import { Card } from "@/components/ui";
import { ContractDocument, PaperSheet } from "@/components/ContractDocument";
import { SigningPanel } from "@/components/sign/SigningPanel";
import { HostedSigningPanel } from "@/components/sign/HostedSigningPanel";
import { AutoRefresh } from "@/components/sign/AutoRefresh";
import { PrintButton } from "@/components/sign/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your membership agreement", robots: { index: false, follow: false } };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await resolveSigningToken(token);
  const contract = s.state === "invalid" ? null : s.contract;
  const tier = contract?.fieldValues.membership_tier;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1060px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href={BRAND.website} className="flex items-center gap-3">
            <span className="font-serif text-[18px] font-semibold sm:text-[20px]">{BRAND.name}</span>
            {tier && <span className="rounded-full bg-bronze px-3 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-white">{tier}</span>}
          </a>
          <span className="hidden text-[14px] text-muted sm:block">Membership Agreement</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1060px] flex-1 px-3 py-6 sm:px-6 sm:py-8">
        {s.state === "invalid" && (
          <Message title="This link isn't valid">
            The signing link may have been replaced by a newer one, or copied incorrectly. Please use the most recent email from {BRAND.name}, or reply to it and we&apos;ll send a new link.
          </Message>
        )}
        {s.state === "expired" && <Message title="This signing link has expired">Please contact the {BRAND.name} team and we&apos;ll send you a new link.</Message>}
        {s.state === "declined" && <Message title="Agreement declined">You declined to sign this agreement. If this was a mistake, please contact the {BRAND.name} team.</Message>}
        {contract && (s.state === "ready" || s.state === "finalising" || s.state === "signed") && (
          <Agreement token={token} contract={contract} state={s.state} />
        )}
      </main>

      <footer className="no-print border-t border-line py-6 text-center text-[12px] leading-5 text-muted">
        <p className="mx-auto max-w-xl px-4">
          {BRAND.legalName} processes the details in this agreement to provide your membership, in line with UK GDPR. Electronic signing is provided by {contract?.esignProvider === "demo" ? "a demo simulator" : "Dropbox Sign"}.
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

function Banner({ icon, title, children }: { icon: "check" | "pen" | "clock"; title: string; children: React.ReactNode }) {
  const paths = {
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
    pen: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <div className="mb-6 flex gap-4 rounded-2xl border border-bronze-light/60 bg-bronze-wash px-5 py-5 sm:px-6">
      <svg viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0 text-bronze" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[icon]}</svg>
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[19px] font-semibold leading-snug sm:text-[21px]">{title}</h1>
        <div className="mt-1 text-[15px] leading-6 text-muted">{children}</div>
      </div>
    </div>
  );
}

async function Agreement({ token, contract: c, state }: { token: string; contract: Contract; state: "ready" | "finalising" | "signed" }) {
  const doc = await contractDoc(c);
  const firstName = c.customerName.split(" ")[0];

  return (
    <>
      <div className="no-print">
        {state === "signed" && (
          <Banner icon="check" title="This agreement has been signed">
            Signed by {c.customerName}
            {c.signedAt ? ` on ${formatLongDate(c.signedAt.slice(0, 10))}` : ""}. A copy is shown below for your records — you can print or save this page as a PDF.
            {c.isDemo && <span className="mt-1 block font-semibold text-red-800">Demo mode: this signature is simulated and not legally binding.</span>}
            <div className="mt-4 flex flex-wrap gap-2">
              {c.signedDocumentPath && (
                <a href={`/api/sign/${token}/document`} target="_blank" className="inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[14px] font-medium text-white hover:bg-ink-soft">
                  Download signed PDF
                </a>
              )}
              <PrintButton />
            </div>
          </Banner>
        )}
        {state === "finalising" && (
          <Banner icon="clock" title="Thank you — finalising your agreement">
            We&apos;re waiting for the e-signature provider to confirm your signature. This usually takes a few seconds, and you&apos;ll also receive a copy by email.
            <AutoRefresh seconds={5} />
          </Banner>
        )}
        {state === "ready" && (
          <Banner icon="pen" title={`Hi ${firstName}, please review and sign your agreement`}>
            {isHostedSigning(c)
              ? <>Read the agreement below, then sign it using the link in the email from <strong className="text-ink">Dropbox Sign</strong>, our secure e-signature provider.</>
              : <>Read the agreement below. When you&apos;re ready, confirm and sign at the bottom of the page — it takes less than a minute.</>}
            {c.isDemo && <span className="mt-1 block font-semibold text-red-800">Demo mode: this is a test agreement. Signing here is simulated and not legally binding.</span>}
          </Banner>
        )}
      </div>

      <PaperSheet>
        <ContractDocument doc={doc} />
      </PaperSheet>

      {state === "ready" && (
        <div className="no-print mx-auto mt-6 max-w-[880px]">
          {isHostedSigning(c)
            ? <HostedSigningPanel token={token} email={c.customerEmail} />
            : <SigningPanel token={token} consentStatement={CONSENT_STATEMENT} customerName={c.customerName} mode={c.esignProvider} />}
          <p className="mt-4 text-center text-[14px]">
            <a href={`/api/sign/${token}/document`} target="_blank" className="font-medium text-bronze-dark hover:underline">Download this agreement as a PDF</a>
          </p>
        </div>
      )}
    </>
  );
}

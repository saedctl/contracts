import type { ReactNode } from "react";
import type { ClientSignature, CompanySignature, ContractDoc } from "@/lib/document";
import type { RenderedBlock, Run } from "@/lib/template";

function Runs({ runs, highlight }: { runs: Run[]; highlight: boolean }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: ReactNode = r.text;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        if (r.field && highlight) node = <mark className={r.missing ? "missing" : undefined} title={r.missing ? `No value for {{${r.field}}}` : `{{${r.field}}}`}>{node}</mark>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-[0.45em] size-4 shrink-0 text-bronze" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  );
}

function Parties({ doc }: { doc: ContractDoc }) {
  return (
    <div className="doc-parties">
      <div>
        <p className="doc-label">The Provider</p>
        <p>
          <strong>{doc.provider.legalName}</strong> trading as <em>“{doc.provider.tradingAs}”</em>
        </p>
        {doc.provider.companyNumber && <p className="text-[13.5px] text-muted">Company no. {doc.provider.companyNumber} · England and Wales</p>}
      </div>
      <div>
        <p className="doc-label">The Client</p>
        <p><strong>{doc.client.name}</strong></p>
      </div>
    </div>
  );
}

function Details({ doc }: { doc: ContractDoc }) {
  return (
    <dl className="doc-details">
      {doc.details.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClientSig({ sig }: { sig: ClientSignature }) {
  let mark: ReactNode = <span className="doc-sig-pending">Awaiting signature</span>;
  if (sig.status === "signed") {
    if (sig.image) {
      // eslint-disable-next-line @next/next/no-img-element
      mark = <img src={sig.image} alt={`Signature of ${sig.name}`} className="max-h-16 max-w-full object-contain" />;
    } else {
      mark = <span className="doc-sig-script">{sig.typedName || sig.name}</span>;
    }
  }
  return (
    <div>
      <div className="doc-sig-area">{mark}</div>
      <p className="doc-sig-name">{sig.name}</p>
      <p className="doc-sig-meta">
        The Client{sig.status === "signed" && sig.signedOn ? ` — signed ${sig.signedOn}` : ""}
        {sig.status === "signed" && sig.method === "dropbox_sign" && <span className="block">Signed electronically via Dropbox Sign</span>}
        {sig.status === "signed" && sig.method === "demo" && <span className="block font-semibold text-red-800">Simulated signature (demo) — not legally binding</span>}
      </p>
    </div>
  );
}

function CompanySig({ sig }: { sig: CompanySignature }) {
  return (
    <div>
      <div className="doc-sig-area">
        {sig.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sig.image} alt={`Signature of ${sig.name}`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="doc-sig-script">{sig.name}</span>
        )}
      </div>
      <p className="doc-sig-name">{sig.name}</p>
      <p className="doc-sig-meta">{sig.role} — auto-applied {sig.appliedOn}</p>
    </div>
  );
}

function Signatures({ doc }: { doc: ContractDoc }) {
  return (
    <div className="doc-signatures">
      <ClientSig sig={doc.signatures.client} />
      {doc.signatures.company && <CompanySig sig={doc.signatures.company} />}
    </div>
  );
}

/**
 * Renders a contract as a printable "paper" document. It uses the same document model as
 * the PDF (lib/document.ts), so the wording and structure are identical.
 */
export function ContractDocument({ doc, highlight = false }: { doc: ContractDoc; highlight?: boolean }) {
  const out: ReactNode[] = [];
  let list: { kind: "li" | "check"; items: ReactNode[] } | null = null;
  const flushList = (key: number) => {
    if (!list) return;
    out.push(
      list.kind === "check" ? (
        <ul key={`l${key}`} className="doc-checks">{list.items}</ul>
      ) : (
        <ul key={`l${key}`}>{list.items}</ul>
      ),
    );
    list = null;
  };

  doc.body.forEach((b: RenderedBlock, i) => {
    if (b.type === "li" || b.type === "check") {
      if (list && list.kind !== b.type) flushList(i);
      list ??= { kind: b.type, items: [] };
      list.items.push(
        b.type === "check" ? (
          <li key={i}><CheckIcon /><span><Runs runs={b.runs} highlight={highlight} /></span></li>
        ) : (
          <li key={i}><Runs runs={b.runs} highlight={highlight} /></li>
        ),
      );
      return;
    }
    flushList(i);
    if (b.type === "hr") out.push(<hr key={i} />);
    else if (b.type === "section") {
      if (b.key === "parties") out.push(<Parties key={i} doc={doc} />);
      else if (b.key === "details_table") out.push(<Details key={i} doc={doc} />);
      else out.push(<Signatures key={i} doc={doc} />);
    } else if (b.type === "callout") {
      out.push(<div key={i} className="doc-callout"><Runs runs={b.runs} highlight={highlight} /></div>);
    } else {
      const Tag = b.type;
      out.push(<Tag key={i}><Runs runs={b.runs} highlight={highlight} /></Tag>);
    }
  });
  flushList(doc.body.length);

  return (
    <article className="contract-doc">
      <header className="doc-header">
        <p className="doc-brand">{doc.brand}</p>
        <h1 className="doc-title">{doc.title}</h1>
        {doc.tagline && <p className="doc-tagline">{doc.tagline}</p>}
      </header>
      {out}
    </article>
  );
}

/** Off-white "desk" with a white sheet of paper on it. */
export function PaperSheet({ children }: { children: ReactNode }) {
  return (
    <div className="paper-desk">
      <div className="paper-sheet">{children}</div>
    </div>
  );
}

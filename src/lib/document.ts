// Builds the structured contract document shown to customers and rendered to PDF.
// Pure TypeScript (no Node APIs): used by the web view, the template editor preview and the PDF.

import { renderTemplate, type RenderedBlock, type Run } from "./template";

export interface DetailRow {
  label: string;
  value: string;
}

export interface ClientSignature {
  name: string;
  /** pending: not signed yet; signed: provider-confirmed (or simulated in demo mode). */
  status: "pending" | "signed";
  signedOn?: string; // "10 August 2026"
  method?: "dropbox_sign" | "demo";
  /** Demo mode only: the simulated signature captured on the page. */
  image?: string; // data URL
  typedName?: string;
}

export interface CompanySignature {
  name: string; // e.g. "Saed Farah"
  role: string; // e.g. "For The Engineers Club"
  appliedOn: string; // "10 August 2026"
  image?: string; // data URL (web) — the PDF receives bytes separately
}

export interface ContractDoc {
  brand: string;
  title: string;
  tagline: string | null;
  provider: { legalName: string; tradingAs: string; companyNumber?: string };
  client: { name: string };
  details: DetailRow[];
  /** Template body in order, with section markers where generated sections go. */
  body: RenderedBlock[];
  signatures: { client: ClientSignature; company: CompanySignature | null };
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join("").trim();

/** Rows for the details table, from the contract's frozen field values. */
export function detailRows(v: Record<string, string>): DetailRow[] {
  const rows: DetailRow[] = [
    { label: "Client name", value: v.customer_name },
    { label: "Email", value: v.customer_email },
    { label: "Phone", value: v.customer_phone },
  ];
  if (v.membership_tier) rows.push({ label: "Membership tier", value: v.membership_tier });
  rows.push({ label: "Membership period", value: `${v.membership_start_date} – ${v.membership_end_date} (${v.membership_duration})` });
  rows.push({ label: "Amount collected", value: v.contract_date ? `${v.amount_paid} on ${v.contract_date}` : v.amount_paid });
  rows.push({ label: "Payment status", value: v.payment_status });
  if (v.payment_status !== "Paid in Full") {
    const due = v.balance_due_date && v.balance_due_date !== "Not applicable" ? ` due ${v.balance_due_date}` : "";
    rows.push({ label: "Deferred balance", value: `${v.outstanding_balance}${due}` });
    if (v.payment_schedule && v.payment_schedule !== "Not applicable") rows.push({ label: "Payment schedule", value: v.payment_schedule });
  }
  return rows.filter((r) => r.value);
}

export function buildContractDoc(
  templateBody: string,
  values: Record<string, string>,
  signatures: { client: ClientSignature; company: CompanySignature | null },
): ContractDoc {
  let body = renderTemplate(templateBody, values);

  // The first H1 becomes the document title; an all-italic paragraph right after it is the tagline.
  let title = "Membership Agreement";
  let tagline: string | null = null;
  const h1 = body.findIndex((b) => b.type === "h1");
  if (h1 !== -1) {
    const b = body[h1] as Extract<RenderedBlock, { runs: Run[] }>;
    title = plain(b.runs) || title;
    const next = body[h1 + 1];
    const remove = [h1];
    if (next && next.type === "p" && next.runs.length && next.runs.every((r) => r.italic || !r.text.trim())) {
      tagline = plain(next.runs);
      remove.push(h1 + 1);
    }
    body = body.filter((_, i) => !remove.includes(i));
  }

  // Generated sections not placed by the template: parties + details at the top, signatures at the end.
  const has = (key: string) => body.some((b) => b.type === "section" && b.key === key);
  const top: RenderedBlock[] = [];
  if (!has("parties")) top.push({ type: "section", key: "parties" });
  if (!has("details_table")) top.push({ type: "section", key: "details_table" });
  body = [...top, ...body];
  if (!has("signatures")) body.push({ type: "section", key: "signatures" });

  return {
    brand: values.business_name || "The Engineers Club",
    title,
    tagline,
    provider: { legalName: values.company_name, tradingAs: values.business_name, companyNumber: values.company_number || undefined },
    client: { name: values.customer_name },
    details: detailRows(values),
    body,
    signatures,
  };
}

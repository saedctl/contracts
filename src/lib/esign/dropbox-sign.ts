import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

// Minimal Dropbox Sign (formerly HelloSign) API v3 client.
// Docs: https://developers.hellosign.com/api/reference/

const BASE = "https://api.hellosign.com/v3";

export class DropboxSignError extends Error {
  constructor(message: string, public status: number, public errorName?: string) {
    super(message);
  }
}

function creds() {
  const c = config.dropboxSign;
  if (!c) throw new Error("Dropbox Sign is not configured");
  return c;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { apiKey } = creds();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Dropbox Sign API error (${res.status})`;
    let name: string | undefined;
    try {
      const body = await res.clone().json();
      msg = body?.error?.error_msg ?? msg;
      name = body?.error?.error_name;
    } catch {}
    throw new DropboxSignError(msg, res.status, name);
  }
  return res;
}

export interface DSSignature {
  signature_id: string;
  signer_email_address: string;
  signer_name: string;
  status_code: string; // awaiting_signature | signed | declined | ...
  signed_at: number | null;
  last_viewed_at: number | null;
  decline_reason?: string | null;
}

export interface DSSignatureRequest {
  signature_request_id: string;
  is_complete: boolean;
  is_declined: boolean;
  has_error: boolean;
  test_mode: boolean;
  title: string;
  created_at: number;
  metadata: Record<string, string>;
  signatures: DSSignature[];
  [key: string]: unknown;
}

export async function createEmbeddedSignatureRequest(input: {
  pdf: Uint8Array;
  filename: string;
  title: string;
  subject: string;
  message: string;
  signerName: string;
  signerEmail: string;
  metadata: Record<string, string>;
}): Promise<{ signatureRequestId: string; signatureId: string; raw: DSSignatureRequest }> {
  const { clientId, testMode } = creds();
  const form = new FormData();
  form.append("client_id", clientId);
  form.append("test_mode", testMode ? "1" : "0");
  form.append("title", input.title);
  form.append("subject", input.subject);
  form.append("message", input.message);
  form.append("signers[0][email_address]", input.signerEmail);
  form.append("signers[0][name]", input.signerName);
  form.append("files[0]", new Blob([input.pdf as BlobPart], { type: "application/pdf" }), input.filename);
  // Signature & date fields are positioned by invisible text tags drawn into the PDF.
  form.append("use_text_tags", "1");
  form.append("hide_text_tags", "1");
  form.append("signing_options[draw]", "1");
  form.append("signing_options[type]", "1");
  form.append("signing_options[upload]", "1");
  form.append("signing_options[phone]", "0");
  form.append("signing_options[default_type]", "draw");
  form.append("allow_decline", "1");
  for (const [k, v] of Object.entries(input.metadata)) form.append(`metadata[${k}]`, v);

  const res = await call("/signature_request/create_embedded", { method: "POST", body: form });
  const body = (await res.json()) as { signature_request: DSSignatureRequest };
  const sr = body.signature_request;
  const signatureId = sr.signatures?.[0]?.signature_id;
  if (!signatureId) throw new Error("Dropbox Sign did not return a signature id");
  return { signatureRequestId: sr.signature_request_id, signatureId, raw: sr };
}

/** Short-lived URL for the embedded signing iframe. Must be fetched fresh for each session. */
export async function getEmbeddedSignUrl(signatureId: string): Promise<string> {
  const res = await call(`/embedded/sign_url/${encodeURIComponent(signatureId)}`);
  const body = (await res.json()) as { embedded: { sign_url: string } };
  return body.embedded.sign_url;
}

export async function getSignatureRequest(id: string): Promise<DSSignatureRequest> {
  const res = await call(`/signature_request/${encodeURIComponent(id)}`);
  return ((await res.json()) as { signature_request: DSSignatureRequest }).signature_request;
}

/**
 * Downloads the completed PDF (with the provider's audit trail appended).
 * Returns null while Dropbox Sign is still processing the final document.
 */
export async function downloadSignedPdf(id: string): Promise<Uint8Array | null> {
  try {
    const res = await call(`/signature_request/files/${encodeURIComponent(id)}?file_type=pdf`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof DropboxSignError && e.status === 409) return null;
    throw e;
  }
}

export async function cancelSignatureRequest(id: string): Promise<void> {
  await call(`/signature_request/cancel/${encodeURIComponent(id)}`, { method: "POST" });
}

/**
 * Verifies a callback event. Dropbox Sign signs each event as
 * HMAC-SHA256(api_key, event_time + event_type), hex encoded.
 */
export function verifyEventHash(event: { event_time?: string; event_type?: string; event_hash?: string }): boolean {
  if (!event.event_time || !event.event_type || !event.event_hash) return false;
  const expected = createHmac("sha256", creds().apiKey).update(`${event.event_time}${event.event_type}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(event.event_hash));
  return a.length === b.length && timingSafeEqual(a, b);
}

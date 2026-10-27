import "server-only";
import { config } from "../config";
import { getStore } from "../db";
import type { EmailLogEntry } from "../types";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array }[];
  kind: EmailLogEntry["kind"];
  contractId: string | null;
  /** Prevents duplicate sends if a request or webhook is retried. */
  idempotencyKey: string;
}

export interface SendResult {
  simulated: boolean;
  messageId: string | null;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const store = await getStore();
  const subject = config.demoMode ? `[DEMO] ${email.subject}` : email.subject;

  if (!config.resend) {
    if (!config.demoMode) throw new Error("Email is not configured (RESEND_API_KEY / EMAIL_FROM).");
    // Demo mode: nothing is sent. The entry is logged and shown in the dashboard as simulated.
    console.info(`[demo email — NOT SENT] to=${email.to} subject="${subject}"`);
    await store.addEmailLog({ contractId: email.contractId, kind: email.kind, to: email.to, subject, providerMessageId: null, simulated: true });
    return { simulated: true, messageId: null };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: config.resend.from,
      to: [email.to],
      reply_to: config.resend.replyTo,
      subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
      tags: [{ name: "kind", value: email.kind }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Email delivery failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { id?: string };
  await store.addEmailLog({ contractId: email.contractId, kind: email.kind, to: email.to, subject, providerMessageId: body.id ?? null, simulated: false });
  return { simulated: false, messageId: body.id ?? null };
}

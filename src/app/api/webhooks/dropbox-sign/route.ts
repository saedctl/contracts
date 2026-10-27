import { config } from "@/lib/config";
import { getStore } from "@/lib/db";
import { verifyEventHash, type DSSignatureRequest } from "@/lib/esign/dropbox-sign";
import { audit } from "@/lib/services/audit";
import { syncFromProvider } from "@/lib/services/contracts";

// Dropbox Sign callback. Configure this URL as the API app's "Event callback" URL:
//   https://<your-domain>/api/webhooks/dropbox-sign
// Dropbox Sign requires the exact response body below, otherwise it retries and eventually
// disables the callback.
const ACK = "Hello API Event Received";

function ack(status = 200) {
  return new Response(ACK, { status, headers: { "Content-Type": "text/plain" } });
}

interface Payload {
  event: { event_time: string; event_type: string; event_hash: string; event_metadata?: Record<string, unknown> };
  signature_request?: DSSignatureRequest;
}

export async function POST(req: Request) {
  if (!config.dropboxSign) return new Response("Not configured", { status: 404 });

  let payload: Payload;
  try {
    const type = req.headers.get("content-type") ?? "";
    const raw = type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")
      ? String((await req.formData()).get("json") ?? "")
      : await req.text();
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // 1. Authenticity: HMAC of event_time + event_type keyed with our API key.
  if (!payload?.event || !verifyEventHash(payload.event)) {
    console.warn("Dropbox Sign webhook rejected: invalid event hash");
    return new Response("Invalid signature", { status: 401 });
  }

  const { event_type: eventType, event_time: eventTime } = payload.event;
  if (eventType === "callback_test") return ack();

  const sr = payload.signature_request;
  const contractId = sr?.metadata?.contract_id;
  if (!sr || !contractId) return ack(); // Not one of ours (e.g. account-level events).

  const store = await getStore();
  const contract = await store.getContract(contractId);
  // 2. Binding: the request id in the event must match the one stored for this contract.
  if (!contract || contract.providerRequestId !== sr.signature_request_id) {
    console.warn(`Dropbox Sign webhook for unknown contract/request ${contractId}/${sr.signature_request_id}`);
    return ack();
  }

  const key = `dropbox_sign:${sr.signature_request_id}:${eventType}:${eventTime}`;
  try {
    // 3. State is never taken from the event body: we re-fetch it from the provider API.
    if (["signature_request_viewed", "signature_request_signed", "signature_request_all_signed", "signature_request_downloadable", "signature_request_declined"].includes(eventType)) {
      await syncFromProvider(contract.id);
    }
    if (await store.claimWebhookEvent(key, "dropbox_sign", eventType, { event: payload.event, signature_request_id: sr.signature_request_id })) {
      await audit(contract.id, { type: "provider", label: "Dropbox Sign" }, "provider.event", { eventType, eventTime });
    }
  } catch (e) {
    console.error("Dropbox Sign webhook processing failed", e);
    // Non-2xx makes Dropbox Sign retry later; processing is idempotent.
    return new Response("Processing failed", { status: 500 });
  }
  return ack();
}

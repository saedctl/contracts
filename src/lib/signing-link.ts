import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config, getSecret } from "./config";
import type { Contract } from "./types";

// Signing links are `/sign/<contractId>.<mac>` where mac = HMAC(secret, contractId:nonce).
// Nothing secret is stored in the database, the link can be re-shown to staff ("copy link"),
// and rotating the contract's nonce instantly revokes every previously issued link.

function mac(contractId: string, nonce: string): string {
  return createHmac("sha256", getSecret("SIGNING_LINK_SECRET")).update(`${contractId}:${nonce}`).digest("base64url");
}

export function signingToken(contract: Pick<Contract, "id" | "linkNonce">): string {
  return `${contract.id}.${mac(contract.id, contract.linkNonce)}`;
}

export function signingUrl(contract: Pick<Contract, "id" | "linkNonce">): string {
  return `${config.appUrl}/sign/${signingToken(contract)}`;
}

export function parseSigningToken(token: string): { contractId: string; mac: string } | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(token);
  return m ? { contractId: m[1], mac: m[2] } : null;
}

export function verifySigningMac(contract: Pick<Contract, "id" | "linkNonce">, providedMac: string): boolean {
  const expected = Buffer.from(mac(contract.id, contract.linkNonce));
  const given = Buffer.from(providedMac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

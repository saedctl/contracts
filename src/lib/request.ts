import "server-only";
import { headers } from "next/headers";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function metaFromHeaders(h: Headers): RequestMeta {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 400) || null,
  };
}

export async function requestMeta(): Promise<RequestMeta> {
  return metaFromHeaders(await headers());
}

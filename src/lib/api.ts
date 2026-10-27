import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "./auth/session";
import { ImmutableContractError } from "./db/types";
import { UserFacingError } from "./services/contracts";
import type { StaffUser } from "./types";
import { zodFieldErrors } from "./validation";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown, extra: Record<string, unknown> = {}) {
  if (e instanceof ZodError) return json({ error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(e), ...extra }, 422);
  if (e instanceof UserFacingError) return json({ error: e.message, ...extra }, 400);
  if (e instanceof ImmutableContractError) return json({ error: e.message, ...extra }, 409);
  console.error(e);
  return json({ error: "Something went wrong on our side. Please try again.", ...extra }, 500);
}

/** Wraps a staff-only route handler: 401 without a valid session, errors mapped to JSON. */
export function staffRoute<C>(handler: (req: Request, user: StaffUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const user = await getCurrentUser();
    if (!user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    try {
      return await handler(req, user, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new UserFacingError("Request too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new UserFacingError("Invalid request.");
  }
}

export function pdfResponse(bytes: Uint8Array, filename: string, disposition: "inline" | "attachment" = "inline") {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename.replace(/[^\w .()-]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

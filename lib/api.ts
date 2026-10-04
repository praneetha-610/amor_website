import "server-only";
import { NextResponse } from "next/server";
import { MESSAGES, type ErrorCode } from "@/lib/messages";

export function jsonError(code: ErrorCode, message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

export function serverError(err: unknown) {
  // Log for the operator; the customer only ever sees the friendly line.
  console.error("[amor-fati]", err instanceof Error ? err.message : err);
  return jsonError("SERVER", MESSAGES.SERVER, 500);
}

/** Reads a small JSON body safely. Returns null on bad/oversized input. */
export async function readJson(req: Request, maxBytes = 4096): Promise<unknown | null> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Basic CSRF defence for state-changing requests: same-origin only. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, QA scripts)
  try {
    return new URL(origin).host === (req.headers.get("host") ?? "");
  } catch {
    return false;
  }
}

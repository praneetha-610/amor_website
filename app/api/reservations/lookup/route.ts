import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { clientIp, confirmationToken, RESERVATION_ID_RE } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { MESSAGES } from "@/lib/messages";
import { isValidMobile, normalizeMobile } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * "My reservation": a customer must supply BOTH their reservation ID and the
 * mobile number on it. We never reveal whether an ID exists on its own.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return jsonError("VALIDATION", MESSAGES.SERVER, 403);
    if (!rateLimit(`lookup:${clientIp(req)}`, 10, 10 * 60_000)) {
      return jsonError("RATE_LIMITED", MESSAGES.RATE_LIMITED, 429);
    }
    const body = (await readJson(req)) as { reservationId?: unknown; mobile?: unknown } | null;
    const id = String(body?.reservationId ?? "").trim().toUpperCase().replace(/^AF(?!-)/, "AF-");
    const mobile = normalizeMobile(String(body?.mobile ?? ""));
    if (!isValidMobile(mobile)) return jsonError("VALIDATION", MESSAGES.INVALID_MOBILE, 400);
    if (!RESERVATION_ID_RE.test(id)) return jsonError("NOT_FOUND", MESSAGES.NOT_FOUND, 404);

    const r = await getStore().getReservation(id);
    if (!r || r.mobile_number !== mobile) return jsonError("NOT_FOUND", MESSAGES.NOT_FOUND, 404);

    return NextResponse.json({ ok: true, url: `/reserved/${id}?k=${confirmationToken(id)}` });
  } catch (e) {
    return serverError(e);
  }
}

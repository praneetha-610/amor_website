import { NextResponse } from "next/server";
import { getBurger, reservationTotal } from "@/config/site";
import { getStore } from "@/lib/db";
import { clientIp, confirmationToken } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { MESSAGES } from "@/lib/messages";
import { isValidMobile, namesMatch, normalizeMobile, sanitizeName } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * "My reservation": the customer enters the NAME and MOBILE NUMBER they booked with
 * (no ID needed — they may have lost it). We only answer when BOTH match, and say the same
 * generic thing for "no such number" and "wrong name", so the form can't be used to probe
 * which numbers have booked. Rate-limited per IP and per number.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return jsonError("VALIDATION", MESSAGES.SERVER, 403);
    if (!rateLimit(`lookup:${clientIp(req)}`, 10, 10 * 60_000)) {
      return jsonError("RATE_LIMITED", MESSAGES.RATE_LIMITED, 429);
    }
    const body = (await readJson(req)) as { name?: unknown; mobile?: unknown } | null;
    const name = sanitizeName(String(body?.name ?? ""));
    const mobile = normalizeMobile(String(body?.mobile ?? ""));
    if (name.length < 2) return jsonError("VALIDATION", MESSAGES.INVALID_NAME, 400);
    if (!isValidMobile(mobile)) return jsonError("VALIDATION", MESSAGES.INVALID_MOBILE, 400);
    if (!rateLimit(`lookup-mobile:${mobile}`, 6, 10 * 60_000)) {
      return jsonError("RATE_LIMITED", MESSAGES.RATE_LIMITED, 429);
    }

    const rows = (await getStore().findByMobile(mobile)).filter((r) => namesMatch(name, r.customer_name));
    if (!rows.length) return jsonError("NOT_FOUND", MESSAGES.NOT_FOUND, 404);

    return NextResponse.json({
      ok: true,
      reservations: rows.slice(0, 20).map((r) => ({
        reservationId: r.reservation_id,
        name: r.customer_name,
        burger: r.burger_type,
        burgerName: getBurger(r.burger_type).name,
        date: r.reservation_date,
        quantity: r.quantity,
        total: reservationTotal(r.burger_type, r.quantity, r.unit_price),
        status: r.status,
        url: `/reserved/${r.reservation_id}?k=${confirmationToken(r.reservation_id)}`,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

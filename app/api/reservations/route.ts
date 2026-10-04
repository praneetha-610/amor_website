import { NextResponse } from "next/server";
import { bookBurger } from "@/lib/reservations";
import { clientIp, confirmationToken } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { MESSAGES } from "@/lib/messages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return jsonError("VALIDATION", MESSAGES.SERVER, 403);
    if (!rateLimit(`book:${clientIp(req)}`, 8, 10 * 60_000)) {
      return jsonError("RATE_LIMITED", MESSAGES.RATE_LIMITED, 429);
    }

    const body = await readJson(req);
    if (!body) return jsonError("VALIDATION", MESSAGES.SERVER, 400);

    const out = await bookBurger(body);
    if (!out.ok) {
      const status = out.code === "VALIDATION" ? 400 : out.code === "SERVER" ? 500 : 409;
      return jsonError(out.code, out.message, status, { remaining: out.remaining, fieldErrors: out.fieldErrors });
    }

    const id = out.reservation.reservation_id;
    return NextResponse.json({
      ok: true,
      reservationId: id,
      replayed: out.replayed,
      url: `/reserved/${id}?k=${confirmationToken(id)}`,
    });
  } catch (e) {
    return serverError(e);
  }
}

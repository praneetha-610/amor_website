import { NextResponse } from "next/server";
import { isAdmin, RESERVATION_ID_RE } from "@/lib/security";
import { getStore } from "@/lib/db";
import { STATUSES, type ReservationStatus } from "@/lib/db/types";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  try {
    const { id } = await ctx.params;
    const body = (await readJson(req)) as { status?: unknown } | null;
    if (!RESERVATION_ID_RE.test(id) && !/^AF-DEMO\d+$/.test(id)) return jsonError("NOT_FOUND", "Not found.", 404);
    if (!STATUSES.includes(body?.status as ReservationStatus)) return jsonError("VALIDATION", "Invalid status.", 400);

    const next = body!.status as ReservationStatus;
    // A reservation is for ONE date (each date has its own 30 burgers), so it can only be handed over on that date.
    if (next === "completed") {
      const current = await getStore().getReservation(id);
      if (!current) return jsonError("NOT_FOUND", "Not found.", 404);
      if (current.reservation_date !== todayIST()) {
        return jsonError("DATE_UNAVAILABLE", "This reservation isn't for today, so it can't be marked collected.", 409);
      }
    }
    const updated = await getStore().updateStatus(id, next);
    if (!updated) return jsonError("NOT_FOUND", "Not found.", 404);
    return NextResponse.json({ ok: true, reservation: updated });
  } catch (e) {
    return serverError(e);
  }
}

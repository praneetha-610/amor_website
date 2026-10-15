import { NextResponse } from "next/server";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { isAdmin } from "@/lib/security";
import { belowBookedMessage, loadCapacityOverview } from "@/lib/admin-capacity";
import { getStore } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { jsonError, sameOrigin, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Admin only: remove a change that has NOT started yet. (Changes already in force are history and stay.) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("NOT_FOUND", "That change no longer exists.", 404);
    const defaults = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).dailyLimit])) as Record<BurgerKey, number>;
    const res = await getStore().deleteCapacityRule(id, todayIST(), defaults);
    if (res.status === "not_found") {
      return jsonError("NOT_FOUND", "That change has already started (or no longer exists), so it can't be removed.", 404);
    }
    if (res.status === "below_claimed") {
      // the rule's burger isn't returned by the store; name it from the message-safe overview
      const overview = await loadCapacityOverview();
      const rule = overview.rules.find((r) => r.id === id);
      return jsonError("BELOW_BOOKED", belowBookedMessage((rule?.burger_type ?? "cheese") as BurgerKey, res.date, res.claimed, res.limit), 409, { date: res.date, claimed: res.claimed });
    }
    return NextResponse.json({ ok: true, ...(await loadCapacityOverview()) });
  } catch (e) {
    return serverError(e);
  }
}

import { NextResponse } from "next/server";
import { isBurgerKey, getBurger, type BurgerKey } from "@/config/site";
import { isAdmin } from "@/lib/security";
import { ADMIN_ACTOR, DB_UPDATE_MSG, bookableDates, burgerName, loadScarcityOverview, needsDbUpdate } from "@/lib/admin-scarcity";
import { getStore } from "@/lib/db";
import { shortDate } from "@/lib/dates";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { HOLD_OPS, MAX_HOLD, type HoldOp } from "@/lib/scarcity";

export const dynamic = "force-dynamic";

const ACTION: Record<HoldOp, string> = {
  set_available: "availability_set",
  hold: "stock_reserved",
  release: "stock_released",
  sold_out: "marked_sold_out",
  restore: "availability_restored",
};

/**
 * Admin only: hide / release stock for one burger — on ONE date, or on every bookable date from that date on.
 * The change is made by the database inside the same locks the booking function uses, so it can never race a booking,
 * and it can never expose more than is actually unbooked. Reservations are never touched.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  try {
    const b = (await readJson(req)) as { burger?: unknown; date?: unknown; scope?: unknown; op?: unknown; amount?: unknown } | null;
    if (!isBurgerKey(b?.burger)) return jsonError("VALIDATION", "Choose a burger.", 400);
    const burger = b.burger as BurgerKey;
    if (typeof b?.op !== "string" || !HOLD_OPS.includes(b.op as HoldOp)) return jsonError("VALIDATION", "Unknown action.", 400);
    const op = b.op as HoldOp;
    const needsAmount = op === "set_available" || op === "hold" || op === "release";
    const amount = needsAmount ? Number(b.amount) : 0;
    if (needsAmount && (!Number.isInteger(amount) || amount < 0 || amount > MAX_HOLD)) {
      return jsonError("VALIDATION", `Enter a whole number from 0 to ${MAX_HOLD}.`, 400);
    }
    if (b?.scope !== "one" && b?.scope !== "window") return jsonError("VALIDATION", "Choose one day or every day.", 400);
    const open = bookableDates();
    const date = typeof b?.date === "string" ? b.date : "";
    if (!open.includes(date)) return jsonError("VALIDATION", "That date isn't open for booking, so its stock can't be changed.", 400);

    const dates = b.scope === "one" ? [date] : open.filter((d) => d >= date);
    const store = getStore();
    const results = [];
    for (const d of dates) {
      const r = await store.adjustHold({ burger, date: d, op, amount, defaultLimit: getBurger(burger).dailyLimit, clamp: b.scope === "window" });
      if (r.status === "too_many") {
        const msg =
          op === "set_available"
            ? `Only ${r.max} burger${r.max === 1 ? " is" : "s are"} unbooked on ${shortDate(d)}, so you can't make ${amount} available.`
            : `Only ${r.max} burger${r.max === 1 ? " is" : "s are"} available to hide on ${shortDate(d)}.`;
        return jsonError("TOO_MANY", msg, 409, { max: r.max, date: d });
      }
      results.push({ date: d, ...r });
    }

    const first = results[0];
    const clamped = results.filter((r) => (op === "set_available" ? r.available !== amount : op === "hold" ? r.held - r.previous !== amount : false)).length;
    await store.addAudit({
      actor: ADMIN_ACTOR,
      action: ACTION[op],
      burger,
      date,
      previous: b.scope === "one" ? { held: first.previous } : { held: results.reduce((n, r) => n + r.previous, 0), days: results.length },
      next: b.scope === "one" ? { held: first.held, available: first.available } : { held: results.reduce((n, r) => n + r.held, 0), days: results.length },
      detail:
        `${burgerName(burger)} · ${b.scope === "one" ? shortDate(date) : `${shortDate(date)} onward (${results.length} days)`}` +
        (needsAmount ? ` · ${amount}` : "") +
        (clamped ? ` · ${clamped} day${clamped === 1 ? "" : "s"} limited to what was possible` : ""),
    });

    return NextResponse.json({ ok: true, days: results.length, clamped, ...(await loadScarcityOverview(date)) });
  } catch (e) {
    if (needsDbUpdate(e)) return jsonError("SERVER", DB_UPDATE_MSG, 503);
    return serverError(e);
  }
}

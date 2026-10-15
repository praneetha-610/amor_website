import { NextResponse } from "next/server";
import { isBurgerKey, type BurgerKey } from "@/config/site";
import { isAdmin } from "@/lib/security";
import { MAX_DAILY_LIMIT } from "@/lib/capacity";
import { belowBookedMessage, loadCapacityOverview } from "@/lib/admin-capacity";
import { getStore } from "@/lib/db";
import { isValidISODate, todayIST } from "@/lib/dates";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The database hasn't been updated with the daily-limits tables yet. */
function needsDbUpdate(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}
const DB_UPDATE_MSG = "Daily limits need a one-time database update. Run supabase/schema.sql in the Supabase SQL Editor, then try again.";

/** Admin only: current limits, the floor (most already booked), and active/scheduled changes. */
export async function GET() {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  try {
    return NextResponse.json({ ok: true, ...(await loadCapacityOverview()) });
  } catch (e) {
    return serverError(e);
  }
}

/** Admin only: set the daily limit for a burger from a date (onward), or for a single day / range. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  try {
    const b = (await readJson(req)) as { burger?: unknown; limit?: unknown; start?: unknown; end?: unknown } | null;
    if (!isBurgerKey(b?.burger)) return jsonError("VALIDATION", "Choose a burger.", 400);
    const limit = Number(b?.limit);
    if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DAILY_LIMIT) {
      return jsonError("VALIDATION", `Enter a whole number from 0 to ${MAX_DAILY_LIMIT}.`, 400);
    }
    const today = todayIST();
    const start = b?.start === undefined || b?.start === null || b?.start === "" ? today : String(b.start);
    if (!isValidISODate(start)) return jsonError("VALIDATION", "That start date isn't valid.", 400);
    if (start < today) return jsonError("VALIDATION", "Changes can't start in the past — past days keep the limit they had.", 400);
    let end: string | null = null;
    if (b?.end !== undefined && b?.end !== null && b?.end !== "") {
      end = String(b.end);
      if (!isValidISODate(end)) return jsonError("VALIDATION", "That end date isn't valid.", 400);
      if (end < start) return jsonError("VALIDATION", "The end date can't be before the start date.", 400);
    }

    const res = await getStore().setCapacity({ burger: b.burger as BurgerKey, start, end, limit });
    if (res.status === "below_claimed") {
      return jsonError("BELOW_BOOKED", belowBookedMessage(b.burger as BurgerKey, res.date, res.claimed), 409, { date: res.date, claimed: res.claimed });
    }
    return NextResponse.json({ ok: true, rule: res.rule, ...(await loadCapacityOverview()) });
  } catch (e) {
    if (needsDbUpdate(e)) return jsonError("SERVER", DB_UPDATE_MSG, 503);
    return serverError(e);
  }
}

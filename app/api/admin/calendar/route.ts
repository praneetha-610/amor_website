import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { loadCalendarMonth } from "@/lib/admin-data";
import { jsonError, serverError } from "@/lib/api";
import { isValidISODate, todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Admin only: per-day sold counts for one month (past or future). ?month=YYYY-MM */
export async function GET(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  try {
    const m = new URL(req.url).searchParams.get("month") ?? todayIST().slice(0, 7);
    const iso = /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : "";
    if (!isValidISODate(iso)) return jsonError("VALIDATION", "Invalid month.", 400);
    return NextResponse.json({ ok: true, ...(await loadCalendarMonth(iso)) });
  } catch (e) {
    return serverError(e);
  }
}

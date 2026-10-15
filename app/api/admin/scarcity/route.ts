import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { DB_UPDATE_MSG, loadScarcityOverview, needsDbUpdate } from "@/lib/admin-scarcity";
import { jsonError, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Admin only: the four numbers for one date (default: the first bookable day), the settings and the audit log. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  try {
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    return NextResponse.json({ ok: true, ...(await loadScarcityOverview(date)) });
  } catch (e) {
    if (needsDbUpdate(e)) return jsonError("SERVER", DB_UPDATE_MSG, 503);
    return serverError(e);
  }
}

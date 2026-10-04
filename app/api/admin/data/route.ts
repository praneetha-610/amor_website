import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { loadAdminData } from "@/lib/admin-data";
import { jsonError, serverError } from "@/lib/api";
import { todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  try {
    const sp = new URL(req.url).searchParams;
    const today = todayIST();
    const data = await loadAdminData({
      from: sp.get("from") ?? today,
      to: sp.get("to") ?? sp.get("from") ?? today,
      q: (sp.get("q") ?? "").slice(0, 60),
      status: sp.get("status") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return serverError(e);
  }
}

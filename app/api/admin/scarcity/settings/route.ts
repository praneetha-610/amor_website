import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { ADMIN_ACTOR, DB_UPDATE_MSG, loadScarcityOverview, needsDbUpdate } from "@/lib/admin-scarcity";
import { getStore } from "@/lib/db";
import { jsonError, readJson, sameOrigin, serverError } from "@/lib/api";
import { cleanMessage, MAX_MESSAGE } from "@/lib/scarcity";

export const dynamic = "force-dynamic";

/** Admin only: scarcity mode ON/OFF, the public message, the low-stock threshold. Every change is logged. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return jsonError("VALIDATION", "Unauthorized.", 401);
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  try {
    const b = (await readJson(req)) as { enabled?: unknown; message?: unknown; low_threshold?: unknown; date?: unknown } | null;
    if (!b) return jsonError("VALIDATION", "Nothing to save.", 400);

    const patch: { enabled?: boolean; message?: string; low_threshold?: number } = {};
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== "boolean") return jsonError("VALIDATION", "Scarcity mode must be ON or OFF.", 400);
      patch.enabled = b.enabled;
    }
    if (b.message !== undefined) {
      const m = cleanMessage(b.message);
      if (!m) return jsonError("VALIDATION", `The message must be 1–${MAX_MESSAGE} characters.`, 400);
      patch.message = m;
    }
    if (b.low_threshold !== undefined) {
      const n = Number(b.low_threshold);
      if (!Number.isInteger(n) || n < 0 || n > 1000) return jsonError("VALIDATION", "The low-stock number must be a whole number from 0 to 1000.", 400);
      patch.low_threshold = n;
    }
    if (!Object.keys(patch).length) return jsonError("VALIDATION", "Nothing to save.", 400);

    const store = getStore();
    const { previous, current } = await store.saveScarcity(patch);
    const log = (action: string, from: unknown, to: unknown) =>
      store.addAudit({ actor: ADMIN_ACTOR, action, burger: null, date: null, previous: from, next: to, detail: null });
    if (patch.enabled !== undefined && patch.enabled !== previous.enabled) await log(patch.enabled ? "scarcity_enabled" : "scarcity_disabled", { enabled: previous.enabled }, { enabled: current.enabled });
    if (patch.message !== undefined && patch.message !== previous.message) await log("message_changed", { message: previous.message }, { message: current.message });
    if (patch.low_threshold !== undefined && patch.low_threshold !== previous.low_threshold) await log("low_threshold_changed", { low_threshold: previous.low_threshold }, { low_threshold: current.low_threshold });

    const date = typeof b.date === "string" ? b.date : undefined;
    return NextResponse.json({ ok: true, ...(await loadScarcityOverview(date)) });
  } catch (e) {
    if (needsDbUpdate(e)) return jsonError("SERVER", DB_UPDATE_MSG, 503);
    return serverError(e);
  }
}

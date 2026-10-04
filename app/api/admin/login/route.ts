import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkAdminPassword, clientIp, createAdminSession } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, readJson, sameOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("VALIDATION", "Not allowed.", 403);
  if (!rateLimit(`admin-login:${clientIp(req)}`, 6, 15 * 60_000)) {
    return jsonError("RATE_LIMITED", "Too many attempts. Try again in a few minutes.", 429);
  }
  const body = (await readJson(req)) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !checkAdminPassword(body.password)) {
    return jsonError("VALIDATION", "Incorrect password.", 401);
  }
  const s = createAdminSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, s.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: s.maxAge,
  });
  return res;
}

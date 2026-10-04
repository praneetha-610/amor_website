import { NextResponse } from "next/server";
import { getPublicAvailability } from "@/lib/inventory";
import { serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public: inventory numbers only. No customer data. */
export async function GET() {
  try {
    return NextResponse.json(await getPublicAvailability(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}

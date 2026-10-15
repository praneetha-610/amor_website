import "server-only";
import { cache } from "react";
import { getStore } from "@/lib/db";
import { headlineFrom, limitOn, defaultLimitFor, type CapacityRule, type HeadlineLimits } from "@/lib/capacity";
import { todayIST } from "@/lib/dates";
import type { BurgerKey } from "@/config/site";

/** All limit rules. Throws if the database is unreachable (callers that must be exact use this). */
export async function getCapacityRules(): Promise<CapacityRule[]> {
  return getStore().listCapacityRules();
}

/** Same, but never throws — for marketing copy, which should still render if the database hiccups. */
const safeRules = cache(async (): Promise<CapacityRule[]> => {
  try {
    return await getStore().listCapacityRules();
  } catch (e) {
    console.error("[amor-fati] capacity rules unavailable:", e instanceof Error ? e.message : e);
    return [];
  }
});

/** Today's limit for each burger, for headlines, page titles and the share image. */
export async function getHeadlineLimits(): Promise<HeadlineLimits> {
  return headlineFrom(await safeRules(), todayIST());
}

/** The limit for one burger on one date (e.g. "N were made" on a ticket). */
export async function limitFor(burger: BurgerKey, date: string): Promise<number> {
  try {
    return limitOn(await getCapacityRules(), burger, date);
  } catch {
    return defaultLimitFor(burger);
  }
}

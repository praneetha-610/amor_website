/**
 * Daily limits ("how many of each burger we make per day") — pure logic shared by the customer
 * pages, the admin panel and the demo store. The Supabase database has the SAME rule in SQL
 * (capacity_for), and scripts/test-sql.mjs + scripts/test-capacity.ts keep them identical.
 *
 * A RULE says: "from start_date (to end_date, or onward) the limit for <burger> is N".
 * For any date: a SPECIFIC-DAY rule (has an end_date) always beats a general "from X onward" rule;
 * among rules of the same kind the NEWEST wins; with no rule the built-in default applies.
 * (So changing the general limit never overwrites a special day you set earlier.)
 */
import { siteConfig, type BurgerKey } from "@/config/site";

export interface CapacityRule {
  id: string;
  burger_type: BurgerKey;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // null = from start_date onward, forever
  daily_limit: number;
  created_at: string; // ISO timestamp
}

/** The biggest number the admin panel will accept (the database allows up to 1000). */
export const MAX_DAILY_LIMIT = 500;

export function ruleCovers(r: CapacityRule, burger: BurgerKey, date: string): boolean {
  return r.burger_type === burger && r.start_date <= date && (r.end_date === null || r.end_date >= date);
}

/** Sort order: specific-day rules first, then newest first (same as SQL: (end_date is not null) desc, created_at desc, id desc). */
export function newestFirst(a: CapacityRule, b: CapacityRule): number {
  const ab = a.end_date !== null, bb = b.end_date !== null;
  if (ab !== bb) return ab ? -1 : 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/** Is a date governed by a specific-day rule for this burger? (then a general rule doesn't change it) */
export function hasSpecificRule(rules: CapacityRule[], burger: BurgerKey, date: string): boolean {
  return rules.some((r) => r.end_date !== null && ruleCovers(r, burger, date));
}

/** The rule that decides the limit for one burger on one date (null = the built-in default applies). */
export function winningRule(rules: CapacityRule[], burger: BurgerKey, date: string): CapacityRule | null {
  let best: CapacityRule | null = null;
  for (const r of rules) {
    if (!ruleCovers(r, burger, date)) continue;
    if (!best || newestFirst(r, best) < 0) best = r;
  }
  return best;
}

export function resolveLimit(rules: CapacityRule[], burger: BurgerKey, date: string, defaultLimit: number): number {
  const w = winningRule(rules, burger, date);
  return w ? w.daily_limit : defaultLimit;
}

/** The built-in default for a burger (config/site.ts) — used when no rule covers a date. */
export function defaultLimitFor(burger: BurgerKey): number {
  return siteConfig.burgers[burger].dailyLimit;
}

export function limitOn(rules: CapacityRule[], burger: BurgerKey, date: string): number {
  return resolveLimit(rules, burger, date, defaultLimitFor(burger));
}

/**
 * "Few left" thresholds scale with the limit, so the urgency wording stays honest at any size
 * (20/day → limited below 7, almost gone below 4; 6/day → below 2 / below 1).
 */
export function thresholds(limit: number): { limited: number; almostGone: number } {
  return {
    limited: Math.min(siteConfig.limitedThreshold, Math.max(1, Math.ceil(limit / 3))),
    almostGone: Math.min(siteConfig.almostGoneThreshold, Math.max(1, Math.ceil(limit / 6))),
  };
}

export type AvailabilityStatus = "available" | "limited" | "sold_out";

export function statusFor(remaining: number, limit: number): AvailabilityStatus {
  if (remaining <= 0) return "sold_out";
  if (remaining < thresholds(limit).limited) return "limited";
  return "available";
}

export interface HeadlineLimits {
  cheese: number;
  nashville: number;
  total: number;
  /** the single number when both burgers share one limit, else null */
  each: number | null;
}

/** Only the general "from a date onward" rules — the USUAL limit, ignoring one-off special days. */
export function generalRules(rules: CapacityRule[]): CapacityRule[] {
  return rules.filter((r) => r.end_date === null);
}

/** The usual (general) limit for a burger on a date — what the cafe normally makes, ignoring special days. */
export function usualLimitOn(rules: CapacityRule[], burger: BurgerKey, date: string): number {
  return limitOn(generalRules(rules), burger, date);
}

/**
 * The USUAL limit for each burger today — what marketing copy ("20 only. Every day.") should quote.
 * One-off special days are deliberately ignored here so a single busy/quiet day doesn't rewrite the headline.
 */
export function headlineFrom(rules: CapacityRule[], today: string): HeadlineLimits {
  const cheese = usualLimitOn(rules, "cheese", today);
  const nashville = usualLimitOn(rules, "nashville", today);
  return { cheese, nashville, total: cheese + nashville, each: cheese === nashville ? cheese : null };
}

/** "20 ONLY. EVERY DAY." — or "LIMITED. EVERY DAY." when the two burgers have different limits. */
export function onlyPhrase(h: HeadlineLimits): string {
  return h.each !== null ? `${h.each} ONLY. EVERY DAY.` : "LIMITED. EVERY DAY.";
}

/** "20 of each." — or "Limited quantities of each." */
export function ofEachPhrase(h: HeadlineLimits): string {
  return h.each !== null ? `${h.each} of each.` : "Limited quantities of each.";
}

/** "20 only. Every day." (sentence case, for the footer) */
export function onlySentence(h: HeadlineLimits): string {
  return h.each !== null ? `${h.each} only. Every day.` : "Limited. Every day.";
}

import "server-only";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { limitOn, MAX_DAILY_LIMIT, usualLimitOn, winningRule, type CapacityRule } from "@/lib/capacity";
import { addDays, clock, eachDate, firstChangeableDate, longDate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";

export interface CapacityOverview {
  today: string;
  /** today's reservations have closed (past the evening cutoff), so today can no longer be changed */
  todayClosed: boolean;
  /** the first date whose limit can still be changed: today before the cutoff, otherwise tomorrow */
  firstChangeable: string;
  max: number;
  burgers: Record<
    BurgerKey,
    {
      /** the USUAL daily limit (general "from a date onward" setting), ignoring one-off special days */
      usual: number;
      /** the limit that actually applies on the first changeable day (differs from `usual` on a special day) */
      onFirst: number;
      /** built-in default from config/site.ts (used where no setting applies) */
      configDefault: number;
      /** bookings per future date, so the screen can show "already booked: N on <date>" for the chosen scope */
      booked: { date: string; claimed: number }[];
    }
  >;
  /**
   * settings worth showing, soonest first. `effective` = it decides the limit on at least one day from today on;
   * a setting that has started but no longer decides anything is history and is left out.
   */
  rules: (CapacityRule & { effective: boolean })[];
}

export async function loadCapacityOverview(): Promise<CapacityOverview> {
  const store = getStore();
  const now = clock();
  const today = todayIST(now);
  const firstChangeable = firstChangeableDate(now);
  const [rules, claimed] = await Promise.all([store.listCapacityRules(), store.claimedCounts(today, addDays(today, 400))]);

  const burgers = {} as CapacityOverview["burgers"];
  for (const k of BURGER_KEYS) {
    burgers[k] = {
      usual: usualLimitOn(rules, k, firstChangeable),
      onFirst: limitOn(rules, k, firstChangeable),
      configDefault: getBurger(k).dailyLimit,
      booked: claimed.filter((c) => c.burger === k && c.date >= firstChangeable && c.claimed > 0).map((c) => ({ date: c.date, claimed: c.claimed })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  }

  const horizon = addDays(today, 450);
  const live = rules
    .filter((r) => r.end_date === null || r.end_date >= today)
    .map((r) => {
      // does this rule still decide the limit on any day from today onward?
      const from = r.start_date > today ? r.start_date : today;
      const to = r.end_date !== null && r.end_date < horizon ? r.end_date : horizon;
      let effective = false;
      for (const d of eachDate(from, to)) if (winningRule(rules, r.burger_type, d)?.id === r.id) { effective = true; break; }
      return { ...r, effective };
    })
    .filter((r) => r.effective || r.start_date > today) // replaced rules that already started are just history
    .sort((a, b) => (a.start_date !== b.start_date ? (a.start_date < b.start_date ? -1 : 1) : a.created_at < b.created_at ? 1 : -1));

  return { today, todayClosed: firstChangeable !== today, firstChangeable, max: MAX_DAILY_LIMIT, burgers, rules: live };
}

/** "Super Cheese already has 34 booked for Wednesday, 28 October." */
export function belowBookedMessage(burger: BurgerKey, date: string, claimed: number, limit?: number): string {
  const day = longDate(date).replace(/ \d{4}$/, "");
  const name = getBurger(burger).displayName;
  return limit === undefined
    ? `${name} already has ${claimed} booked for ${day}. Choose ${claimed} or more, or cancel some of those bookings first.`
    : `Can't remove this change: ${name} already has ${claimed} booked for ${day}, but the earlier limit is only ${limit}. Cancel some bookings first, or keep this change.`;
}

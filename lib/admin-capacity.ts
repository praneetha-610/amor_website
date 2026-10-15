import "server-only";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { hasSpecificRule, limitOn, MAX_DAILY_LIMIT, winningRule, type CapacityRule } from "@/lib/capacity";
import { addDays, eachDate, longDate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";

export interface CapacityOverview {
  today: string;
  max: number;
  burgers: Record<
    BurgerKey,
    {
      /** limit in force today */
      current: number;
      /** built-in default from config/site.ts (used where no rule applies) */
      configDefault: number;
      /** the most already booked on any single date from today onward that the general limit governs — the lowest general limit the owner can choose */
      floor: { claimed: number; date: string | null };
    }
  >;
  /**
   * rules worth showing, soonest first. `effective` = the rule decides the limit on at least one day from today on;
   * a rule that has started but no longer decides anything is history and is left out.
   */
  rules: (CapacityRule & { effective: boolean })[];
}

export async function loadCapacityOverview(): Promise<CapacityOverview> {
  const store = getStore();
  const today = todayIST();
  const [rules, claimed] = await Promise.all([store.listCapacityRules(), store.claimedCounts(today, addDays(today, 400))]);

  const burgers = {} as CapacityOverview["burgers"];
  for (const k of BURGER_KEYS) {
    let top = { claimed: 0, date: null as string | null };
    // specific-day settings keep their own number, so they don't limit how low the GENERAL limit can go
    for (const c of claimed) if (c.burger === k && !hasSpecificRule(rules, k, c.date) && c.claimed > top.claimed) top = { claimed: c.claimed, date: c.date };
    burgers[k] = { current: limitOn(rules, k, today), configDefault: getBurger(k).dailyLimit, floor: top };
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

  return { today, max: MAX_DAILY_LIMIT, burgers, rules: live };
}

/** "Super Cheese already has 34 booked for Wednesday, 28 October." */
export function belowBookedMessage(burger: BurgerKey, date: string, claimed: number, limit?: number): string {
  const day = longDate(date).replace(/ \d{4}$/, "");
  const name = getBurger(burger).displayName;
  return limit === undefined
    ? `${name} already has ${claimed} booked for ${day}. Choose ${claimed} or more, or cancel some of those bookings first.`
    : `Can't remove this change: ${name} already has ${claimed} booked for ${day}, but the earlier limit is only ${limit}. Cancel some bookings first, or keep this change.`;
}

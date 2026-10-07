"use client";

import type { BurgerKey } from "@/config/site";
import type { AvailabilityPayload } from "@/lib/inventory";
import { relativeLabel, shortDate } from "@/lib/dates";

/**
 * One burger's live count for EACH reservable date (today + next 2), side by side:
 *   TODAY OCT 07 · 30 LEFT   |   TOMORROW OCT 08 · 28 LEFT   |   THU OCT 09 · 30 LEFT
 * Used everywhere counts appear, so a booking for any date is visible immediately.
 * Pass `selected` + `onSelect` to make the cells a day picker (burger page meter).
 */
export function DayCounts({
  burger,
  data,
  selected,
  onSelect,
  tone = "light",
}: {
  burger: BurgerKey;
  data: AvailabilityPayload;
  selected?: string;
  onSelect?: (date: string) => void;
  tone?: "light" | "dark";
}) {
  if (!data.days.length) return null;
  return (
    <div className={`daycounts daycounts--${tone}`} role="group" aria-label="Burgers left on each date">
      {data.days.map((d) => {
        const b = d.burgers[burger];
        const closed = !d.bookable;
        const sold = b.remaining <= 0;
        const label = closed ? "CLOSED" : sold ? "SOLD OUT" : "LEFT";
        const inner = (
          <>
            <span className="dc__day">{relativeLabel(d.date, data.today)}</span>
            <span className="dc__date">{shortDate(d.date)}</span>
            {closed || sold ? (
              <span className="dc__state">{label}</span>
            ) : (
              <>
                <b className="dc__n" data-urgent={b.status === "limited" || undefined}>{b.remaining}</b>
                <span className="dc__l">LEFT</span>
              </>
            )}
          </>
        );
        const common = { className: "dc", "data-status": closed ? "closed" : b.status, "data-selected": selected === d.date || undefined };
        return onSelect ? (
          <button key={d.date} type="button" {...common} aria-pressed={selected === d.date} onClick={() => onSelect(d.date)} disabled={closed}>
            {inner}
          </button>
        ) : (
          <div key={d.date} {...common} role="listitem">{inner}</div>
        );
      })}
    </div>
  );
}

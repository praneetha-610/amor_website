"use client";

import { useMemo, useState } from "react";
import type { BurgerKey } from "@/config/site";
import { getBurger } from "@/config/site";
import type { AvailabilityPayload } from "@/lib/inventory";
import { addMonths, dayOfMonth, monthGrid, monthLabel, monthStart, monthEnd, longDate } from "@/lib/dates";

const HEADS = ["M", "T", "W", "T", "F", "S", "S"];
const HEAD_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Month calendar for picking ANY reservable date (the booking window is configurable, 30 days by default).
 * Each cell shows how many burgers are left for the chosen burger on that date — straight from the database.
 * States are never colour-only: numbers, ✕ for sold out, – for closed, dashed border for "almost gone".
 */
export function DateCalendar({
  data,
  burger,
  selected,
  onSelect,
}: {
  data: AvailabilityPayload;
  burger: BurgerKey;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const byDate = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data.days]);
  const first = data.days[0]?.date;
  const last = data.days[data.days.length - 1]?.date;
  const [month, setMonth] = useState<string | null>(null);
  if (!first || !last) return null;

  const shown = month ?? monthStart(selected || first);
  const canPrev = monthStart(shown) > monthStart(first);
  const canNext = monthEnd(shown) < last;
  const weeks = monthGrid(shown);
  const name = getBurger(burger).displayName;

  return (
    <div className="cal" role="group" aria-label={`Pick a date for ${name}`}>
      <p className="cal__for">SHOWING BURGERS LEFT FOR <b>{name.toUpperCase()}</b></p>
      <div className="cal__nav">
        <button type="button" onClick={() => setMonth(addMonths(shown, -1))} disabled={!canPrev} aria-label="Previous month">‹</button>
        <p className="cal__month" aria-live="polite">{monthLabel(shown).toUpperCase()}</p>
        <button type="button" onClick={() => setMonth(addMonths(shown, 1))} disabled={!canNext} aria-label="Next month">›</button>
      </div>

      <div className="cal__grid" role="grid">
        {HEADS.map((h, i) => (
          <span key={i} className="cal__head" role="columnheader" aria-label={HEAD_LONG[i]}>{h}</span>
        ))}
        {weeks.flat().map((iso, i) => {
          if (!iso) return <span key={`e${i}`} className="cal__cell cal__cell--empty" aria-hidden />;
          const d = byDate.get(iso);
          const today = iso === data.today;
          if (!d) {
            // outside the booking window (past, or too far ahead)
            return (
              <span key={iso} className="cal__cell cal__cell--out" data-today={today || undefined} aria-label={`${longDate(iso)} — not open for reservations`}>
                <b>{dayOfMonth(iso)}</b>
              </span>
            );
          }
          const b = d.burgers[burger];
          const state = !d.bookable ? "closed" : b.remaining <= 0 ? "sold_out" : b.status;
          const label =
            state === "closed" ? "closed" : state === "sold_out" ? "sold out" : `${b.remaining} left${state === "limited" ? ", almost gone" : ""}`;
          return (
            <button
              key={iso}
              type="button"
              className="cal__cell"
              data-state={state}
              data-selected={selected === iso || undefined}
              data-today={today || undefined}
              disabled={state === "closed" || state === "sold_out"}
              aria-pressed={selected === iso}
              aria-label={`${longDate(iso)}${today ? " (today)" : ""}: ${label}`}
              onClick={() => onSelect(iso)}
            >
              <b>{dayOfMonth(iso)}</b>
              <span className="cal__n" aria-hidden>
                {state === "closed" ? "–" : state === "sold_out" ? "✕" : b.remaining}
              </span>
            </button>
          );
        })}
      </div>

      <p className="cal__legend">
        <span><b>28</b> burgers left</span>
        <span><i className="cal__key cal__key--limited" aria-hidden /> almost gone</span>
        <span>✕ sold out</span>
        <span>– closed</span>
      </p>
    </div>
  );
}

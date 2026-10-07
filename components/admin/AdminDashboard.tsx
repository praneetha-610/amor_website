"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BURGER_KEYS, formatPrice, getBurger, reservationTotal, type BurgerKey } from "@/config/site";
import { addDays, addMonths, dayOfMonth, eachDate, longDate, monthGrid, monthLabel, monthStart, shortDate } from "@/lib/dates";
import type { AdminData, CalendarMonth } from "@/lib/admin-data";
import type { Reservation, ReservationStatus } from "@/lib/db/types";
import { lockScroll } from "@/lib/scroll-lock";

type Preset = "today" | "tomorrow" | "upcoming" | "week" | "month" | "custom";
type View = "list" | "calendar" | "log" | "burger" | "sales";

const NAMES = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).shortName])) as Record<BurgerKey, string>;
const STATUS_LABEL: Record<ReservationStatus, string> = { confirmed: "CONFIRMED", completed: "COLLECTED", cancelled: "CANCELLED", no_show: "NO SHOW" };

function weekRange(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mon = addDays(today, -((dow + 6) % 7));
  return [mon, addDays(mon, 6)];
}

const bookedAt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

const pretty = (m: string) => `${m.slice(0, 5)} ${m.slice(5)}`;

const timeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

/** What staff should do with this booking RIGHT NOW. */
function verdict(r: Reservation, today: string): { tone: "go" | "warn" | "stop" | "done"; text: string } {
  if (r.status === "cancelled") return { tone: "stop", text: "CANCELLED — do not serve" };
  if (r.status === "completed") return { tone: "done", text: `ALREADY COLLECTED${r.collected_at ? ` at ${timeOnly(r.collected_at)}` : ""} — don't serve again` };
  if (r.status === "no_show") return { tone: "warn", text: "Marked NO SHOW earlier" };
  if (r.reservation_date === today) return { tone: "go", text: `VALID TODAY — hand over ${r.quantity} × ${NAMES[r.burger_type]}` };
  if (r.reservation_date > today) return { tone: "warn", text: `NOT FOR TODAY — booked for ${shortDate(r.reservation_date)}. Ask them to come on that day.` };
  return { tone: "stop", text: `PAST DATE — booked for ${shortDate(r.reservation_date)}. Not valid today.` };
}

export function AdminDashboard({ today, demo }: { today: string; demo: boolean }) {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [burger, setBurger] = useState<"" | BurgerKey>("");
  const [view, setView] = useState<View>("list");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  // calendar tab
  const [calMonth, setCalMonth] = useState(monthStart(today));
  const [cal, setCal] = useState<CalendarMonth | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const seq = useRef(0);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p === "today") { setFrom(today); setTo(today); }
    if (p === "tomorrow") { setFrom(addDays(today, 1)); setTo(addDays(today, 1)); }
    if (p === "upcoming") { setFrom(today); setTo(addDays(today, 6)); }
    if (p === "month") { setFrom(monthStart(today)); setTo(addDays(addMonths(today, 1), -1)); }
    if (p === "week") { const [a, b] = weekRange(today); setFrom(a); setTo(b); }
  };

  const load = useCallback(async () => {
    const n = ++seq.current;
    const params = new URLSearchParams({ from, to, q, status });
    try {
      const res = await fetch(`/api/admin/data?${params}`, { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out = await res.json();
      if (n !== seq.current) return;
      if (!res.ok) throw new Error();
      setData(out);
      setError("");
      setUpdatedAt(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }));
    } catch {
      if (n === seq.current) setError("Couldn't load reservations. If this keeps happening, check the database connection (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in Vercel).");
    }
  }, [from, to, q, status]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const loadCal = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/calendar?month=${calMonth.slice(0, 7)}`, { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out = await res.json();
      if (res.ok) setCal(out);
    } catch { /* keep the last month shown */ }
  }, [calMonth]);

  // refresh the calendar when its tab is open, the month changes, or the bookings list changed (e.g. after a cancel)
  useEffect(() => {
    if (view === "calendar") void loadCal();
  }, [view, loadCal, data]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  // keep the page still behind the cancel dialog
  useEffect(() => {
    if (!cancelling) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCancelling(null);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); unlock(); };
  }, [cancelling]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function setRes(r: Reservation, next: ReservationStatus) {
    setBusyId(r.reservation_id);
    try {
      const res = await fetch(`/api/admin/reservations/${r.reservation_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) { location.reload(); return; }
      if (!res.ok) throw new Error();
      setToast(`${r.reservation_id} · ${STATUS_LABEL[next].toLowerCase()}`);
      await load();
    } catch {
      setError("Couldn't update that reservation. Please try again.");
    }
    setBusyId(null);
    setCancelling(null);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  }

  const list = useMemo(() => (data?.reservations ?? []).filter((r) => !burger || r.burger_type === burger), [data, burger]);

  // BY BURGER roster: burger → date → people
  const roster = useMemo(() => {
    const out: { burger: BurgerKey; days: { date: string; rows: Reservation[]; qty: number }[]; qty: number }[] = [];
    for (const k of BURGER_KEYS) {
      if (burger && burger !== k) continue;
      const byDate = new Map<string, Reservation[]>();
      for (const r of list) if (r.burger_type === k && r.status !== "cancelled") (byDate.get(r.reservation_date) ?? byDate.set(r.reservation_date, []).get(r.reservation_date)!).push(r);
      const days = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, rows]) => ({
        date, qty: rows.reduce((n, r) => n + r.quantity, 0),
        rows: rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
      }));
      out.push({ burger: k, days, qty: days.reduce((n, d) => n + d.qty, 0) });
    }
    return out;
  }, [list, burger]);

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ["Reservation ID", "Name", "Mobile", "Burger", "Date", "Quantity", "Total (INR)", "Status", "Booked at (IST)", "Policy accepted"],
      ...list.map((r) => [
        r.reservation_id, r.customer_name, r.mobile_number, getBurger(r.burger_type).name, r.reservation_date, r.quantity,
        reservationTotal(r.burger_type, r.quantity, r.unit_price), STATUS_LABEL[r.status], bookedAt(r.created_at), r.consent_accepted ? "yes" : "no",
      ]),
    ];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `amor-fati-reservations-${from}${to !== from ? `_to_${to}` : ""}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const searching = q.trim().length > 0; // counter mode: just the search box + the answer
  const shownView: View = searching ? "list" : view;
  function pickDay(date: string) {
    setPreset("custom");
    if (rangeMode && anchor) {
      const [a, b] = anchor <= date ? [anchor, date] : [date, anchor];
      setFrom(a); setTo(b); setAnchor(null);
    } else {
      setFrom(date); setTo(date);
      setAnchor(rangeMode ? date : null);
    }
  }

  const single = from === to;
  const rangeLabel = single ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;

  const renderCards = () => (
          <ul className="a-list">
      {list.map((r) => (
        <li key={r.reservation_id} className={`a-res a-res--${r.burger_type}`} data-status={r.status}>
          {(() => { const v = verdict(r, today); return <p className={`a-verdict a-verdict--${v.tone}`}>{v.text}</p>; })()}
          <div className="a-res__head">
            <button className="a-res__id" onClick={() => { navigator.clipboard?.writeText(r.reservation_id); setToast(`Copied ${r.reservation_id}`); }} aria-label={`Reservation ID ${r.reservation_id}, tap to copy`}>
              {r.reservation_id}
            </button>
            <span className={`a-pill a-pill--${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <p className="a-res__name">{r.customer_name}</p>
          <p className="a-res__contact">
            <a href={`tel:+91${r.mobile_number}`}>📞 {pretty(r.mobile_number)}</a>
            <a href={`https://wa.me/91${r.mobile_number}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
          </p>
          <p className="a-res__what">
            <span className={`a-burger a-burger--${r.burger_type}`}>{NAMES[r.burger_type]}</span>
            <b>× {r.quantity}</b> · {formatPrice(reservationTotal(r.burger_type, r.quantity, r.unit_price))} ·
            <span className={`a-day ${r.reservation_date === today ? "a-day--today" : "a-day--other"}`}>
              {r.reservation_date === today ? "TODAY" : r.reservation_date === addDays(today, 1) ? "TOMORROW" : longDate(r.reservation_date).replace(/ \d{4}$/, "")}
            </span>
          </p>
          <p className="a-res__meta">
            Booked {bookedAt(r.created_at)}{r.consent_accepted ? " · ✓ no-show policy accepted" : ""}
            {r.collected_at && <><br />✓ Collected {bookedAt(r.collected_at)}</>}
            {r.cancelled_at && <><br />✕ Cancelled {bookedAt(r.cancelled_at)}</>}
          </p>
          {r.status !== "cancelled" && (
            <div className="a-res__actions">
              {/* Collecting is only possible for TODAY's bookings — every date has its own 30 burgers. */}
              {r.status === "confirmed" && r.reservation_date === today && (
                <button className="a-btn a-btn--go" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "completed")}>✓ MARK COLLECTED</button>
              )}
              {/* "No show" only makes sense once the day has come. */}
              {r.status === "confirmed" && r.reservation_date <= today && (
                <button className="a-btn" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "no_show")}>NO SHOW</button>
              )}
              {(r.status === "completed" || r.status === "no_show") && (
                <button className="a-btn" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "confirmed")}>UNDO</button>
              )}
              <button className="a-btn a-btn--danger" disabled={busyId === r.reservation_id} onClick={() => setCancelling(r)}>CANCEL</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <main className="admin">
      <header className="admin__top">
        <div>
          <p className="admin__brand">AMOR FATI · STAFF</p>
          <h1>RESERVATIONS</h1>
        </div>
        <div className="admin__top-actions">
          <button className="a-btn a-btn--ghost" onClick={load} aria-label="Refresh">↻ REFRESH</button>
          <button className="a-btn a-btn--ghost" onClick={logout}>SIGN OUT</button>
        </div>
      </header>
      <p className="admin__updated">{updatedAt ? `Updated ${updatedAt} · auto-refreshes every 20s` : "Loading…"}</p>
      {demo && <p className="admin-note">DEMO MODE — sample data only. Connect Supabase to go live.</p>}
      {error && <p className="form__error" role="alert">{error}</p>}

      {/* TODAY (hidden while searching, so the answer appears right under the search box) */}
      {!searching && <section aria-label="Today's inventory">
        <h2 className="admin__h">TODAY · {shortDate(today)}</h2>
        <div className="a-today">
          {BURGER_KEYS.map((k) => {
            const d = data?.todaySummary[k];
            const pct = d ? Math.round((d.sold / d.limit) * 100) : 0;
            return (
              <div key={k} className={`a-card a-card--${k}`}>
                <p className="a-card__name">{NAMES[k]}</p>
                <p className="a-card__sold">{d ? d.sold : "–"}<small> / {d ? d.limit : "–"} SOLD</small></p>
                <div className="a-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
                <p className="a-card__left">{d ? (d.remaining === 0 ? "SOLD OUT" : `${d.remaining} LEFT`) : "–"}</p>
                <p className="a-card__sub">{d ? `${d.completed} collected` : ""}</p>
              </div>
            );
          })}
        </div>
      </section>}

      {/* FIND — the search box stays pinned while you scroll */}
      <div className="a-searchbar">
        <label className="sr-only" htmlFor="a-search">Search by name, mobile number or reservation ID</label>
        <input id="a-search" type="search" className="a-search" placeholder="Search name · mobile · AF-XXXXXX" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCorrect="off" />
      </div>
      {!searching && <section aria-label="Find reservations" className="a-filters">
        <div className="a-chips" role="group" aria-label="Date range">
          {([["today", "TODAY"], ["tomorrow", "TOMORROW"], ["upcoming", "NEXT 7 DAYS"], ["week", "THIS WEEK"], ["month", "THIS MONTH"], ["custom", "CUSTOM"]] as [Preset, string][]).map(([p, label]) => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => choose(p)}>{label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="a-range">
            <label>FROM <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
            <label>TO <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <div className="a-chips" role="group" aria-label="Burger">
          <button type="button" aria-pressed={burger === ""} onClick={() => setBurger("")}>ALL BURGERS</button>
          {BURGER_KEYS.map((k) => <button key={k} type="button" aria-pressed={burger === k} onClick={() => setBurger(k)}>{NAMES[k]}</button>)}
        </div>
        <label className="a-status">
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ALL STATUSES</option>
            <option value="confirmed">CONFIRMED (not yet collected)</option>
            <option value="completed">COLLECTED</option>
            <option value="no_show">NO SHOW</option>
            <option value="cancelled">CANCELLED</option>
          </select>
        </label>
      </section>}

      {data?.searchedAllDates && <p className="admin-note admin-note--info">Searching <b>all dates</b> for “{q}”. Clear the search to go back to {rangeLabel}.</p>}

      {data && !searching && (
        <section aria-label={`Totals for ${rangeLabel}`} className="a-totals">
          <div><b>{data.totals.bookings}</b><span>BOOKINGS</span></div>
          <div><b>{data.totals.burgers}</b><span>BURGERS</span></div>
          <div><b>{data.totals.confirmed}</b><span>TO COLLECT</span></div>
          <div><b>{data.totals.completed}</b><span>COLLECTED</span></div>
          <div><b>{data.totals.cancelled}</b><span>CANCELLED</span></div>
        </section>
      )}

      {/* VIEW TABS */}
      {!searching && <div className="a-tabs" role="tablist" aria-label="View">
        {([["list", "ALL BOOKINGS"], ["calendar", "CALENDAR"], ["log", "COLLECTED LOG"], ["burger", "WHO BOOKED WHAT"], ["sales", "DAILY SALES"]] as [View, string][]).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>{label}</button>
        ))}
        <button className="a-tabs__csv" onClick={exportCsv} disabled={!list.length}>⇩ CSV</button>
      </div>}

      {!data ? (
        <p className="admin-note">Loading…</p>
      ) : shownView === "list" ? (
        list.length === 0 ? (
          <p className="admin-note">{searching ? `Nothing found for “${q}” on any date. Check the spelling or try the last 5 digits of the mobile.` : `No reservations for ${rangeLabel}.`}</p>
        ) : (
          renderCards()
        )
      ) : shownView === "calendar" ? (
        <section className="a-cal" aria-label="Sales calendar">
          <div className="a-cal__nav">
            <button onClick={() => setCalMonth(addMonths(calMonth, -1))} aria-label="Previous month">‹</button>
            <p>{monthLabel(calMonth).toUpperCase()}</p>
            <button onClick={() => setCalMonth(addMonths(calMonth, 1))} aria-label="Next month">›</button>
          </div>
          <div className="a-cal__tools">
            <button className="a-btn a-btn--ghost" onClick={() => { setCalMonth(monthStart(today)); pickDay(today); }}>JUMP TO TODAY</button>
            <button className="a-btn a-btn--ghost" aria-pressed={rangeMode} data-on={rangeMode || undefined} onClick={() => { setRangeMode((v) => !v); setAnchor(null); }}>
              {rangeMode ? (anchor ? "TAP THE LAST DAY…" : "TAP THE FIRST DAY…") : "SELECT A RANGE"}
            </button>
          </div>

          {cal && (
            <p className="a-cal__totals">
              <span><b>{cal.totals.burgers}</b> {cal.totals.burgers === 1 ? "burger" : "burgers"} · <b>{cal.totals.bookings}</b> {cal.totals.bookings === 1 ? "booking" : "bookings"} this month</span>
              {BURGER_KEYS.map((k) => <span key={k} className={`a-cal__tot a-cal__tot--${k}`}>{NAMES[k]} <b>{cal.totals.perBurger[k].sold}</b> / {cal.totals.perBurger[k].capacity}</span>)}
            </p>
          )}

          <div className="a-cal__grid" role="grid">
            {["M", "T", "W", "T", "F", "S", "S"].map((h, i) => <span key={i} className="a-cal__head">{h}</span>)}
            {monthGrid(calMonth).flat().map((iso, i) => {
              if (!iso) return <span key={`e${i}`} aria-hidden />;
              const d = cal?.days.find((x) => x.date === iso);
              const inRange = iso >= from && iso <= to;
              const isEdge = iso === from || iso === to;
              const c = d?.burgers.cheese.sold ?? 0;
              const n = d?.burgers.nashville.sold ?? 0;
              const cap = d?.burgers.cheese.limit ?? 30;
              return (
                <button
                  key={iso}
                  className="a-cal__cell"
                  data-today={iso === today || undefined}
                  data-in-range={inRange || undefined}
                  data-edge={isEdge || undefined}
                  data-past={iso < today || undefined}
                  aria-pressed={inRange}
                  aria-label={`${longDate(iso)}: Super Cheese ${c} sold, Nashville ${n} sold${iso === today ? ", today" : ""}`}
                  onClick={() => pickDay(iso)}
                >
                  <b>{dayOfMonth(iso)}</b>
                  <span className="a-cal__c" data-full={c >= cap || undefined}>{c}</span>
                  <span className="a-cal__n" data-full={n >= cap || undefined}>{n}</span>
                </button>
              );
            })}
          </div>
          <p className="a-cal__legend"><i className="k k--c" /> Super Cheese sold <i className="k k--n" /> Nashville sold · out of {cal?.days[0]?.burgers.cheese.limit ?? 30} each per day · underlined = sold out</p>

          {/* the selected day or range, summarised, with the actual bookings underneath */}
          {data && (
            <div className="a-cal__sel">
              <h3>{single ? longDate(from).replace(/ \d{4}$/, "") : `${shortDate(from)} – ${shortDate(to)}`}</h3>
              <div className="a-cal__selgrid">
                {BURGER_KEYS.map((k) => {
                  const sold = data.daily.reduce((n, d) => n + d.burgers[k].sold, 0);
                  const cap = data.daily.reduce((n, d) => n + d.burgers[k].limit, 0);
                  return (
                    <div key={k} className={`a-card a-card--${k}`}>
                      <p className="a-card__name">{NAMES[k]}</p>
                      <p className="a-card__sold">{sold}<small> / {cap} SOLD</small></p>
                      <p className="a-card__left">{cap - sold === 0 ? "SOLD OUT" : `${cap - sold} LEFT`}</p>
                    </div>
                  );
                })}
              </div>
              {renderCards()}
              {list.length === 0 && <p className="admin-note">No bookings for this selection.</p>}
            </div>
          )}
        </section>
      ) : shownView === "log" ? (
        <CollectedLog rows={list} />
      ) : shownView === "burger" ? (
        <div className="a-roster">
          {roster.map((b) => (
            <section key={b.burger} className={`a-roster__burger a-roster__burger--${b.burger}`}>
              <h3>{getBurger(b.burger).name} <small>{b.qty} burgers reserved</small></h3>
              {b.days.length === 0 && <p className="admin-note">Nobody has booked this burger for {rangeLabel}.</p>}
              {b.days.map((d) => (
                <div key={d.date} className="a-roster__day">
                  <h4>{longDate(d.date).replace(/ \d{4}$/, "")} <span>{d.qty} / {getBurger(b.burger).dailyLimit}</span></h4>
                  <ol>
                    {d.rows.map((r) => (
                      <li key={r.reservation_id} data-status={r.status}>
                        <b className="a-roster__id">{r.reservation_id}</b>
                        <span className="a-roster__who">{r.customer_name}</span>
                        <span className="a-roster__qty">× {r.quantity}</span>
                        <a href={`tel:+91${r.mobile_number}`}>{pretty(r.mobile_number)}</a>
                        <span className={`a-pill a-pill--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <table className="a-sales">
          <thead><tr><th>Date</th>{BURGER_KEYS.map((k) => <th key={k}>{NAMES[k]}</th>)}<th>Sold</th></tr></thead>
          <tbody>
            {data.daily.map((d) => (
              <tr key={d.date}>
                <td data-label="Date"><b>{shortDate(d.date)}</b></td>
                {BURGER_KEYS.map((k) => (
                  <td key={k} data-label={NAMES[k]}>{d.burgers[k].sold} / {d.burgers[k].limit} · <b>{d.burgers[k].remaining === 0 ? "SOLD OUT" : `${d.burgers[k].remaining} left`}</b></td>
                ))}
                <td data-label="Sold"><b>{BURGER_KEYS.reduce((n, k) => n + d.burgers[k].sold, 0)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ADMIN-ONLY CANCEL CONFIRMATION */}
      {cancelling && (
        <div className="a-modal" role="dialog" aria-modal="true" aria-labelledby="a-dlg-title" onClick={(e) => e.target === e.currentTarget && setCancelling(null)}>
          <div className="a-modal__box">
            <h2 id="a-dlg-title">CANCEL THIS RESERVATION?</h2>
            <p className="a-modal__id">{cancelling.reservation_id}</p>
            <p><b>{cancelling.customer_name}</b> · {pretty(cancelling.mobile_number)}</p>
            <p>{NAMES[cancelling.burger_type]} × {cancelling.quantity} · {shortDate(cancelling.reservation_date)}</p>
            <p className="a-modal__note">The {cancelling.quantity > 1 ? `${cancelling.quantity} burgers go` : "burger goes"} straight back into stock and can be booked by someone else. Only an admin can do this. It can&apos;t be undone.</p>
            <div className="a-modal__actions">
              <button className="a-btn" onClick={() => setCancelling(null)} autoFocus>KEEP IT</button>
              <button className="a-btn a-btn--danger-solid" disabled={busyId === cancelling.reservation_id} onClick={() => setRes(cancelling, "cancelled")}>
                {busyId === cancelling.reservation_id ? "CANCELLING…" : "YES, CANCEL"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <p className="a-toast" role="status">{toast}</p>}
    </main>
  );
}

/** Who showed which ID, and when — newest first. */
function CollectedLog({ rows }: { rows: Reservation[] }) {
  const done = rows.filter((r) => r.status === "completed").sort((a, b) => ((b.collected_at ?? "") < (a.collected_at ?? "") ? -1 : 1));
  const burgers = done.reduce((n, r) => n + r.quantity, 0);
  if (!done.length) return <p className="admin-note">Nobody has been marked collected for this selection yet.</p>;
  return (
    <section className="a-log" aria-label="Collected log">
      <p className="a-log__sum"><b>{done.length}</b> reservations · <b>{burgers}</b> burgers handed over</p>
      <ol>
        {done.map((r) => (
          <li key={r.reservation_id}>
            <span className="a-log__time">{r.collected_at ? bookedAt(r.collected_at) : "—"}</span>
            <s className="a-log__id">{r.reservation_id}</s>
            <span className="a-log__who">{r.customer_name}</span>
            <span className="a-log__what"><span className={`a-burger a-burger--${r.burger_type}`}>{NAMES[r.burger_type]}</span> × {r.quantity}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

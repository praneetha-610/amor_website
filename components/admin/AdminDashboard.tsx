"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BURGER_KEYS, formatPrice, getBurger, reservationTotal, type BurgerKey } from "@/config/site";
import { addDays, shortDate } from "@/lib/dates";
import type { AdminData } from "@/lib/admin-data";
import type { Reservation, ReservationStatus } from "@/lib/db/types";

type Preset = "today" | "tomorrow" | "week" | "custom";

function weekRange(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const mon = addDays(today, -((dow + 6) % 7));
  return [mon, addDays(mon, 6)];
}

const NAMES = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).shortName])) as Record<BurgerKey, string>;

export function AdminDashboard({ today, demo }: { today: string; demo: boolean }) {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p === "today") { setFrom(today); setTo(today); }
    if (p === "tomorrow") { setFrom(addDays(today, 1)); setTo(addDays(today, 1)); }
    if (p === "week") { const [a, b] = weekRange(today); setFrom(a); setTo(b); }
  };

  const load = useCallback(async () => {
    const n = ++seq.current;
    const params = new URLSearchParams({ from, to, q, status });
    try {
      const res = await fetch(`/api/admin/data?${params}`, { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out = await res.json();
      if (n !== seq.current) return; // a newer request superseded this one
      if (!res.ok) throw new Error();
      setData(out);
      setError("");
    } catch {
      if (n === seq.current) setError("Something went wrong. Please try again.");
    }
  }, [from, to, q, status]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function setRes(r: Reservation, next: ReservationStatus) {
    if (next === "cancelled" && !confirm(`Cancel ${r.reservation_id} (${r.customer_name})? This releases the burger${r.quantity > 1 ? "s" : ""} and can't be undone.`)) return;
    setBusyId(r.reservation_id);
    try {
      const res = await fetch(`/api/admin/reservations/${r.reservation_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Couldn't update that reservation. Please try again.");
    }
    setBusyId(null);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  }

  const single = from === to;

  return (
    <main className="admin">
      <header className="admin__top">
        <div>
          <p className="admin__brand">AMOR FATI · STAFF</p>
          <h1>DASHBOARD</h1>
        </div>
        <button className="btn btn--outline btn--sm" onClick={logout}>SIGN OUT</button>
      </header>
      {demo && <p className="admin-note">DEMO MODE — data is temporary sample data, not real bookings.</p>}
      {error && <p className="form__error" role="alert">{error}</p>}

      {/* TODAY */}
      <section aria-label="Today">
        <h2 className="admin__h">TODAY · {shortDate(today)}</h2>
        <div className="a-today">
          {BURGER_KEYS.map((k) => {
            const d = data?.todaySummary[k];
            return (
              <div key={k} className={`a-card a-card--${k}`}>
                <p className="a-card__name">{NAMES[k]}</p>
                <p className="a-card__sold">{d ? `${d.sold} / ${d.limit}` : "—"} <small>SOLD</small></p>
                <p className="a-card__left">{d ? (d.remaining === 0 ? "SOLD OUT" : `${d.remaining} LEFT`) : "—"}</p>
                <p className="a-card__sub">{d ? `${d.completed} collected` : ""}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SEARCH + FILTERS */}
      <section aria-label="Find a reservation" className="a-filters">
        <label className="sr-only" htmlFor="a-search">Search by mobile, reservation ID or name</label>
        <input
          id="a-search"
          type="search"
          className="a-search"
          placeholder="Search name, mobile or AF-XXXXXX"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <div className="a-chips" role="group" aria-label="Date range">
          {(["today", "tomorrow", "week", "custom"] as Preset[]).map((p) => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => choose(p)}>
              {p === "week" ? "THIS WEEK" : p === "custom" ? "CUSTOM DATE" : p.toUpperCase()}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="a-range">
            <label>FROM <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
            <label>TO <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
        <label className="a-status">
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ALL STATUSES</option>
            <option value="confirmed">CONFIRMED</option>
            <option value="completed">COMPLETED</option>
            <option value="cancelled">CANCELLED</option>
            <option value="no_show">NO SHOW</option>
          </select>
        </label>
      </section>

      {/* TOTALS */}
      {data && (
        <section aria-label="Totals" className="a-totals">
          <div><b>{data.totals.bookings}</b><span>BOOKINGS</span></div>
          <div><b>{data.totals.burgers}</b><span>BURGERS</span></div>
          <div><b>{data.totals.confirmed}</b><span>CONFIRMED</span></div>
          <div><b>{data.totals.completed}</b><span>COMPLETED</span></div>
          <div><b>{data.totals.cancelled}</b><span>CANCELLED</span></div>
        </section>
      )}

      {/* RESERVATIONS */}
      <section aria-label="Reservations">
        <h2 className="admin__h">RESERVATIONS {data && <small>({data.reservations.length})</small>}</h2>
        {!data ? (
          <p className="admin-note">Loading…</p>
        ) : data.reservations.length === 0 ? (
          <p className="admin-note">No reservations match.</p>
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>Reservation ID</th><th>Burger</th><th>Qty</th><th>Total</th><th>Name</th><th>Mobile</th><th>Date</th><th>Status</th><th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.reservations.map((r) => (
                <tr key={r.reservation_id} data-status={r.status}>
                  <td data-label="ID" className="a-id">{r.reservation_id}</td>
                  <td data-label="Burger"><span className={`a-burger a-burger--${r.burger_type}`}>{NAMES[r.burger_type]}</span></td>
                  <td data-label="Qty" className="a-qty">{r.quantity}</td>
                  <td data-label="Total">{formatPrice(reservationTotal(r.burger_type, r.quantity, r.unit_price))}</td>
                  <td data-label="Name">
                    {r.customer_name}
                    {r.consent_accepted && <small className="a-consent" title={r.consent_accepted_at ?? ""}>✓ no-show policy accepted</small>}
                  </td>
                  <td data-label="Mobile"><a href={`tel:+91${r.mobile_number}`}>{r.mobile_number}</a></td>
                  <td data-label="Date">{shortDate(r.reservation_date)}</td>
                  <td data-label="Status"><span className={`a-status-pill a-status-pill--${r.status}`}>{r.status.replace("_", " ").toUpperCase()}</span></td>
                  <td className="a-actions">
                    {r.status === "confirmed" && (
                      <>
                        <button className="a-btn a-btn--go" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "completed")}>COMPLETE</button>
                        <button className="a-btn" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "no_show")}>NO SHOW</button>
                        <button className="a-btn a-btn--danger" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "cancelled")}>CANCEL</button>
                      </>
                    )}
                    {(r.status === "completed" || r.status === "no_show") && (
                      <>
                        <button className="a-btn" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "confirmed")}>UNDO</button>
                        {r.status === "no_show" && (
                          <button className="a-btn a-btn--danger" disabled={busyId === r.reservation_id} onClick={() => setRes(r, "cancelled")}>RELEASE</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* DAILY SALES */}
      {data && (
        <section aria-label="Daily sales">
          <h2 className="admin__h">DAILY SALES &amp; INVENTORY {single ? `· ${shortDate(from)}` : ""}</h2>
          <table className="a-table a-table--daily">
            <thead>
              <tr><th>Date</th>{BURGER_KEYS.map((k) => <th key={k}>{getBurger(k).shortName}</th>)}<th>Total sold</th></tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.date}>
                  <td data-label="Date">{shortDate(d.date)}</td>
                  {BURGER_KEYS.map((k) => (
                    <td key={k} data-label={NAMES[k]}>
                      {d.burgers[k].sold} / {d.burgers[k].limit} · <b>{d.burgers[k].remaining === 0 ? "SOLD OUT" : `${d.burgers[k].remaining} left`}</b>
                    </td>
                  ))}
                  <td data-label="Total sold"><b>{BURGER_KEYS.reduce((n, k) => n + d.burgers[k].sold, 0)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

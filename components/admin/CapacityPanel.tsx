"use client";

import { useCallback, useEffect, useState } from "react";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import type { CapacityRule } from "@/lib/capacity";
import { addDays, longDate, shortDate } from "@/lib/dates";
import { lockScroll } from "@/lib/scroll-lock";

const NAMES = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).shortName])) as Record<BurgerKey, string>;

interface Overview {
  today: string;
  max: number;
  burgers: Record<BurgerKey, { current: number; configDefault: number; floor: { claimed: number; date: string | null } }>;
  rules: (CapacityRule & { effective: boolean })[];
}

/** Save one limit change. Returns an error message (already friendly) or null on success. */
export async function saveCapacity(body: { burger: BurgerKey; limit: number; start: string; end: string | null }): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/capacity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) { location.reload(); return "Signed out."; }
    const out = await res.json().catch(() => null);
    return res.ok && out?.ok ? null : out?.message ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

export function ruleRange(r: Pick<CapacityRule, "start_date" | "end_date">): string {
  if (r.end_date === null) return `from ${shortDate(r.start_date)} onward`;
  if (r.end_date === r.start_date) return `${shortDate(r.start_date)} only`;
  return `${shortDate(r.start_date)} – ${shortDate(r.end_date)}`;
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

interface Pending { burger: BurgerKey; limit: number; start: string; end: string | null; from: number; label: string }

export function CapacityPanel({ today, onChanged, prefill }: { today: string; onChanged: () => void; prefill?: { from: string; to: string; n: number } | null }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [draft, setDraft] = useState<Record<BurgerKey, string>>({ cheese: "", nashville: "" });
  const [applyFrom, setApplyFrom] = useState<Record<BurgerKey, "today" | "tomorrow" | "date">>({ cheese: "today", nashville: "today" });
  const [fromDate, setFromDate] = useState<Record<BurgerKey, string>>({ cheese: addDays(today, 2), nashville: addDays(today, 2) });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  // special days form
  const [sp, setSp] = useState({ burger: "cheese" as BurgerKey, from: addDays(today, 1), to: addDays(today, 1), limit: "" });

  // coming from the calendar with days selected: pre-fill the "specific days" form and bring it into view
  useEffect(() => {
    if (!prefill) return;
    setSp((x) => ({ ...x, from: prefill.from, to: prefill.to }));
    const t = setTimeout(() => document.getElementById("a-special")?.scrollIntoView({ block: "start" }), 250);
    return () => clearTimeout(t);
  }, [prefill]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/capacity", { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out = await res.json();
      if (!res.ok) throw new Error();
      setOv(out);
      setLoadErr("");
      setDraft((d) => ({
        cheese: d.cheese === "" ? String(out.burgers.cheese.current) : d.cheese,
        nashville: d.nashville === "" ? String(out.burgers.nashville.current) : d.nashville,
      }));
    } catch {
      setLoadErr("Couldn't load the daily limits. Please try again.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!pending) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); unlock(); };
  }, [pending, saving]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const startFor = (k: BurgerKey) => (applyFrom[k] === "today" ? today : applyFrom[k] === "tomorrow" ? addDays(today, 1) : fromDate[k]);

  function review(k: BurgerKey) {
    if (!ov) return;
    const n = Number(draft[k]);
    const start = startFor(k);
    const key = `limit-${k}`;
    if (draft[k] === "" || !Number.isInteger(n) || n < 0 || n > ov.max) { setErrs((e) => ({ ...e, [key]: `Enter a whole number from 0 to ${ov.max}.` })); return; }
    if (start < today) { setErrs((e) => ({ ...e, [key]: "Pick today or a later date." })); return; }
    setErrs((e) => ({ ...e, [key]: "" }));
    setPending({ burger: k, limit: n, start, end: null, from: ov.burgers[k].current, label: start === today ? "today" : longDate(start).replace(/ \d{4}$/, "") });
  }

  function reviewSpecial() {
    if (!ov) return;
    const n = Number(sp.limit);
    if (sp.limit === "" || !Number.isInteger(n) || n < 0 || n > ov.max) { setErrs((e) => ({ ...e, special: `Enter a whole number from 0 to ${ov.max}.` })); return; }
    if (sp.from < today) { setErrs((e) => ({ ...e, special: "Special days must be today or later." })); return; }
    if (sp.to < sp.from) { setErrs((e) => ({ ...e, special: "The last day can't be before the first day." })); return; }
    setErrs((e) => ({ ...e, special: "" }));
    setPending({ burger: sp.burger, limit: n, start: sp.from, end: sp.to, from: ov.burgers[sp.burger].current, label: sp.from === sp.to ? longDate(sp.from).replace(/ \d{4}$/, "") : `${shortDate(sp.from)} – ${shortDate(sp.to)}` });
  }

  async function confirmSave() {
    if (!pending) return;
    setSaving(true);
    const msg = await saveCapacity({ burger: pending.burger, limit: pending.limit, start: pending.start, end: pending.end });
    setSaving(false);
    if (msg) {
      setErrs((e) => ({ ...e, [pending.end ? "special" : `limit-${pending.burger}`]: msg }));
      setPending(null);
      return;
    }
    setNotice(`${NAMES[pending.burger]} set to ${pending.limit} per day ${pending.end === null ? `from ${pending.label}` : `for ${pending.label}`}. Customers see it now.`);
    setDraft((d) => ({ ...d, [pending.burger]: pending.end === null && pending.start === today ? String(pending.limit) : d[pending.burger] }));
    setPending(null);
    await load();
    onChanged();
  }

  async function removeRule(r: CapacityRule) {
    const res = await fetch(`/api/admin/capacity/${r.id}`, { method: "DELETE" });
    const out = await res.json().catch(() => null);
    if (res.ok && out?.ok) {
      setNotice(`Removed the scheduled change (${NAMES[r.burger_type]} ${r.daily_limit}, ${ruleRange(r)}).`);
      setErrs((e) => ({ ...e, rules: "" }));
      await load();
      onChanged();
    } else {
      setErrs((e) => ({ ...e, rules: out?.message ?? "Couldn't remove that change." }));
    }
  }

  if (loadErr) return <p className="form__error" role="alert">{loadErr}</p>;
  if (!ov) return <p className="admin-note">Loading…</p>;

  return (
    <section className="a-cap" aria-label="Daily limits">
      <p className="a-cap__intro">
        How many of each burger you make <b>per day</b>. Customers see a change <b>immediately</b>. Days that have already passed keep the number they had.
      </p>

      {BURGER_KEYS.map((k) => {
        const o = ov.burgers[k];
        const n = Number(draft[k]);
        const floor = o.floor;
        const diff = Number.isInteger(n) ? n - o.current : 0;
        return (
          <div key={k} className={`a-capcard a-capcard--${k}`}>
            <header className="a-capcard__head">
              <h3>{NAMES[k]}</h3>
              <p><b>{o.current}</b> per day <span>(today)</span></p>
            </header>

            <div className="a-stepper" role="group" aria-label={`${NAMES[k]} burgers per day`}>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, [k]: String(Math.max(0, (Number(d[k]) || 0) - 10)) }))} aria-label="Ten fewer">−10</button>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, [k]: String(Math.max(0, (Number(d[k]) || 0) - 1)) }))} aria-label="One fewer">−1</button>
              <input
                inputMode="numeric"
                value={draft[k]}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: digits(e.target.value) }))}
                aria-label={`${NAMES[k]} per day`}
                aria-invalid={!!errs[`limit-${k}`]}
              />
              <button type="button" onClick={() => setDraft((d) => ({ ...d, [k]: String(Math.min(ov.max, (Number(d[k]) || 0) + 1)) }))} aria-label="One more">+1</button>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, [k]: String(Math.min(ov.max, (Number(d[k]) || 0) + 10)) }))} aria-label="Ten more">+10</button>
            </div>

            {Number.isInteger(n) && diff !== 0 && draft[k] !== "" && (
              <p className="a-capcard__diff">{diff > 0 ? `▲ ${diff} more` : `▼ ${-diff} fewer`} than today&apos;s {o.current}</p>
            )}

            <p className="a-capcard__floor">
              {floor.claimed > 0
                ? <>Already booked: up to <b>{floor.claimed}</b> on {shortDate(floor.date!)}. You can&apos;t go below that.</>
                : "Nothing is booked yet, so you can choose any number."}
            </p>

            <fieldset className="a-capcard__from">
              <legend>APPLY FROM</legend>
              <div className="a-chips">
                {([["today", "TODAY"], ["tomorrow", "TOMORROW"], ["date", "A DATE…"]] as const).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={applyFrom[k] === v} onClick={() => setApplyFrom((a) => ({ ...a, [k]: v }))}>{label}</button>
                ))}
              </div>
              {applyFrom[k] === "date" && (
                <label className="a-capcard__date">FROM THIS DATE
                  <input type="date" min={today} value={fromDate[k]} onChange={(e) => setFromDate((f) => ({ ...f, [k]: e.target.value }))} />
                </label>
              )}
              <p className="a-capcard__hint">From that day on, every day uses this number until you change it again.</p>
            </fieldset>

            {errs[`limit-${k}`] && <p className="form__error" role="alert">{errs[`limit-${k}`]}</p>}
            <button type="button" className="a-btn a-btn--go a-capcard__save" onClick={() => review(k)} disabled={draft[k] === "" || (Number(draft[k]) === o.current && applyFrom[k] === "today")}>
              REVIEW &amp; SAVE
            </button>
          </div>
        );
      })}

      {/* special days */}
      <section id="a-special" className="a-special" aria-label="Change the limit for specific days">
        <h3>SPECIFIC DAYS</h3>
        <p className="a-cap__intro">Busy Saturday? Quiet Tuesday? Set a different number for one day or a few days. These always win over the general limit above, and every other day is unaffected.</p>
        <div className="a-chips" role="group" aria-label="Burger">
          {BURGER_KEYS.map((k) => <button key={k} type="button" aria-pressed={sp.burger === k} onClick={() => setSp((s) => ({ ...s, burger: k }))}>{NAMES[k]}</button>)}
        </div>
        <div className="a-special__row">
          <label>FIRST DAY<input type="date" min={today} value={sp.from} onChange={(e) => setSp((s) => ({ ...s, from: e.target.value, to: s.to < e.target.value ? e.target.value : s.to }))} /></label>
          <label>LAST DAY<input type="date" min={sp.from} value={sp.to} onChange={(e) => setSp((s) => ({ ...s, to: e.target.value }))} /></label>
          <label>BURGERS<input inputMode="numeric" value={sp.limit} placeholder="e.g. 50" onChange={(e) => setSp((s) => ({ ...s, limit: digits(e.target.value) }))} /></label>
        </div>
        {errs.special && <p className="form__error" role="alert">{errs.special}</p>}
        <button type="button" className="a-btn a-btn--go" onClick={reviewSpecial}>REVIEW &amp; SAVE</button>
      </section>

      {/* changes list */}
      <section className="a-rules" aria-label="Active and scheduled changes">
        <h3>CHANGES &amp; SPECIAL DAYS</h3>
        {errs.rules && <p className="form__error" role="alert">{errs.rules}</p>}
        {ov.rules.length === 0 ? (
          <p className="admin-note">No changes yet — every day uses the built-in {ov.burgers.cheese.configDefault} / {ov.burgers.nashville.configDefault}.</p>
        ) : (
          <ul>
            {ov.rules.map((r) => {
              const started = r.start_date <= ov.today;
              const label = !r.effective ? "REPLACED" : started ? "ACTIVE" : "SCHEDULED";
              return (
                <li key={r.id} data-replaced={!r.effective || undefined}>
                  <span className={`a-burger a-burger--${r.burger_type}`}>{NAMES[r.burger_type]}</span>
                  <b className="a-rules__n">{r.daily_limit} per day</b>
                  <span className="a-rules__range">{ruleRange(r)}</span>
                  <span className={`a-pill ${!r.effective ? "a-pill--no_show" : started ? "a-pill--completed" : "a-pill--confirmed"}`}>{label}</span>
                  {!started && <button type="button" className="a-btn a-btn--danger a-rules__rm" onClick={() => removeRule(r)}>REMOVE</button>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="a-rules__note">REPLACED means a newer setting now decides those days. A specific-day setting always wins over the general limit. If two specific-day settings cover the same day, the newest one wins. Changes already in force can&apos;t be removed (they are your history) — just set a new number.</p>
      </section>

      {notice && <p className="a-toast" role="status">{notice}</p>}

      {pending && (
        <div className="a-modal" role="dialog" aria-modal="true" aria-labelledby="cap-dlg" onClick={(e) => e.target === e.currentTarget && !saving && setPending(null)}>
          <div className="a-modal__box">
            <h2 id="cap-dlg">SAVE NEW LIMIT?</h2>
            <p className="a-capdlg__what"><span className={`a-burger a-burger--${pending.burger}`}>{NAMES[pending.burger]}</span></p>
            <p className="a-capdlg__big"><s>{pending.from}</s> → <b>{pending.limit}</b> <small>per day</small></p>
            <p>{pending.end === null ? <>From <b>{pending.label}</b> onward.</> : <>For <b>{pending.label}</b> only.</>}</p>
            <p className="a-modal__note">
              {pending.limit > pending.from
                ? "More burgers go on sale straight away — customers will see the new numbers immediately."
                : pending.limit < pending.from
                  ? "Fewer burgers will be offered. Bookings already made are kept; new bookings stop sooner. Customers see it immediately."
                  : "Customers will see the numbers immediately."}
            </p>
            <div className="a-modal__actions">
              <button className="a-btn" onClick={() => setPending(null)} disabled={saving} autoFocus>KEEP EDITING</button>
              <button className="a-btn a-btn--go" onClick={confirmSave} disabled={saving}>{saving ? "SAVING…" : "YES, SAVE"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

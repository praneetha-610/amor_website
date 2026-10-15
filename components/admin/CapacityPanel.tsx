"use client";

import { useCallback, useEffect, useState } from "react";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { hasSpecificRule, limitOn, type CapacityRule } from "@/lib/capacity";
import { addDays, longDate, shortDate } from "@/lib/dates";
import { lockScroll } from "@/lib/scroll-lock";

const NAMES = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).shortName])) as Record<BurgerKey, string>;

interface Overview {
  today: string;
  todayClosed: boolean;
  firstChangeable: string;
  max: number;
  burgers: Record<BurgerKey, { usual: number; onFirst: number; configDefault: number; booked: { date: string; claimed: number }[] }>;
  rules: (CapacityRule & { effective: boolean })[];
}

type Scope = "one" | "onward";
type When = "first" | "second" | "custom";

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
  if (r.end_date === null) return `every day from ${shortDate(r.start_date)} onward`;
  if (r.end_date === r.start_date) return `${shortDate(r.start_date)} only`;
  return `${shortDate(r.start_date)} – ${shortDate(r.end_date)}`;
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

interface Pending { burger: BurgerKey; limit: number; start: string; end: string | null; from: number; scope: Scope | "range"; label: string }

export function CapacityPanel({ today, onChanged, prefill }: { today: string; onChanged: () => void; prefill?: { from: string; to: string; n: number } | null }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [draft, setDraft] = useState<Record<BurgerKey, string>>({ cheese: "", nashville: "" });
  const [scope, setScope] = useState<Record<BurgerKey, Scope>>({ cheese: "one", nashville: "one" }); // safest default: just that one day
  const [when, setWhen] = useState<Record<BurgerKey, When>>({ cheese: "first", nashville: "first" });
  const [customDate, setCustomDate] = useState<Record<BurgerKey, string>>({ cheese: "", nashville: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  // several-days form
  const [sp, setSp] = useState({ burger: "cheese" as BurgerKey, from: "", to: "", limit: "" });

  const load = useCallback(async (resetDraft = false) => {
    try {
      const res = await fetch("/api/admin/capacity", { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out: Overview = await res.json();
      if (!res.ok) throw new Error();
      setOv(out);
      setLoadErr("");
      setDraft((d) => ({
        cheese: resetDraft || d.cheese === "" ? String(out.burgers.cheese.usual) : d.cheese,
        nashville: resetDraft || d.nashville === "" ? String(out.burgers.nashville.usual) : d.nashville,
      }));
      setCustomDate((c) => ({ cheese: c.cheese || addDays(out.firstChangeable, 2), nashville: c.nashville || addDays(out.firstChangeable, 2) }));
      setSp((x) => ({ ...x, from: x.from || out.firstChangeable, to: x.to || out.firstChangeable }));
    } catch {
      setLoadErr("Couldn't load the daily limits. Please try again.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // coming from the calendar with days selected: pre-fill the "several days" form and bring it into view
  useEffect(() => {
    if (!prefill) return;
    setSp((x) => ({ ...x, from: prefill.from, to: prefill.to }));
    const t = setTimeout(() => document.getElementById("a-special")?.scrollIntoView({ block: "start" }), 250);
    return () => clearTimeout(t);
  }, [prefill]);

  useEffect(() => {
    if (!pending) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); unlock(); };
  }, [pending, saving]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const first = ov?.firstChangeable ?? today;
  const dateFor = (k: BurgerKey) => (when[k] === "first" ? first : when[k] === "second" ? addDays(first, 1) : customDate[k] || addDays(first, 2));
  const dayWord = (d: string) => (d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : longDate(d).replace(/ \d{4}$/, ""));

  /** Most already booked that the chosen scope would have to respect (and which day). */
  function floorFor(k: BurgerKey): { claimed: number; date: string | null } {
    if (!ov) return { claimed: 0, date: null };
    const d = dateFor(k);
    const booked = ov.burgers[k].booked;
    if (scope[k] === "one") return { claimed: booked.find((b) => b.date === d)?.claimed ?? 0, date: d };
    // "every day after": days that have their own special setting keep it, so they don't count
    let top = { claimed: 0, date: null as string | null };
    for (const b of booked) if (b.date >= d && !hasSpecificRule(ov.rules, k, b.date) && b.claimed > top.claimed) top = { claimed: b.claimed, date: b.date };
    return top;
  }

  function review(k: BurgerKey) {
    if (!ov) return;
    const n = Number(draft[k]);
    const start = dateFor(k);
    const key = `limit-${k}`;
    if (draft[k] === "" || !Number.isInteger(n) || n < 0 || n > ov.max) { setErrs((e) => ({ ...e, [key]: `Enter a whole number from 0 to ${ov.max}.` })); return; }
    if (start < ov.firstChangeable) { setErrs((e) => ({ ...e, [key]: ov.todayClosed ? "Today's reservations have closed — pick tomorrow or later." : "Pick today or a later date." })); return; }
    setErrs((e) => ({ ...e, [key]: "" }));
    setPending({
      burger: k, limit: n, start, end: scope[k] === "one" ? start : null,
      from: limitOn(ov.rules, k, start),
      scope: scope[k], label: dayWord(start),
    });
  }

  function reviewSpecial() {
    if (!ov) return;
    const n = Number(sp.limit);
    if (sp.limit === "" || !Number.isInteger(n) || n < 0 || n > ov.max) { setErrs((e) => ({ ...e, special: `Enter a whole number from 0 to ${ov.max}.` })); return; }
    if (sp.from < ov.firstChangeable) { setErrs((e) => ({ ...e, special: ov.todayClosed ? "Today's reservations have closed — start from tomorrow." : "Start from today or later." })); return; }
    if (sp.to < sp.from) { setErrs((e) => ({ ...e, special: "The last day can't be before the first day." })); return; }
    setErrs((e) => ({ ...e, special: "" }));
    setPending({ burger: sp.burger, limit: n, start: sp.from, end: sp.to, from: limitOn(ov.rules, sp.burger, sp.from), scope: "range", label: sp.from === sp.to ? longDate(sp.from).replace(/ \d{4}$/, "") : `${shortDate(sp.from)} – ${shortDate(sp.to)}` });
  }

  async function confirmSave() {
    if (!pending) return;
    setSaving(true);
    const msg = await saveCapacity({ burger: pending.burger, limit: pending.limit, start: pending.start, end: pending.end });
    setSaving(false);
    if (msg) {
      setErrs((e) => ({ ...e, [pending.scope === "range" ? "special" : `limit-${pending.burger}`]: msg }));
      setPending(null);
      return;
    }
    setNotice(
      `${NAMES[pending.burger]} set to ${pending.limit} per day ${
        pending.scope === "onward" ? `from ${pending.label} onward` : pending.scope === "one" ? `for ${pending.label} only` : `for ${pending.label}`
      }. Customers see it now.`,
    );
    setPending(null);
    await load(true);
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

      {ov.todayClosed && (
        <p className="a-cap__closed" role="note">Today&apos;s reservations have closed, so today&apos;s numbers are locked. You can change tomorrow ({shortDate(ov.firstChangeable)}) and later days.</p>
      )}

      {BURGER_KEYS.map((k) => {
        const o = ov.burgers[k];
        const n = Number(draft[k]);
        const floor = floorFor(k);
        const day = dateFor(k);
        const diff = Number.isInteger(n) ? n - o.usual : 0;
        const choices: [When, string][] = [["first", ov.todayClosed ? "TOMORROW" : "TODAY"], ["second", ov.todayClosed ? shortDate(addDays(first, 1)) : "TOMORROW"], ["custom", "A DATE…"]];
        return (
          <div key={k} className={`a-capcard a-capcard--${k}`}>
            <header className="a-capcard__head">
              <h3>{NAMES[k]}</h3>
              <p><b>{o.usual}</b> per day <span>(usual)</span></p>
            </header>
            {o.onFirst !== o.usual && (
              <p className="a-capcard__floor">{dayWord(first) === "today" ? "Today" : dayWord(first).replace(/^./, (c) => c.toUpperCase())} is a special day with <b>{o.onFirst}</b>.</p>
            )}

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
              <p className="a-capcard__diff">{diff > 0 ? `▲ ${diff} more` : `▼ ${-diff} fewer`} than the usual {o.usual}</p>
            )}

            <fieldset className="a-capcard__from">
              <legend>WHICH DAY?</legend>
              <div className="a-chips">
                {choices.map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={when[k] === v} onClick={() => setWhen((w) => ({ ...w, [k]: v }))}>{label}</button>
                ))}
              </div>
              {when[k] === "custom" && (
                <label className="a-capcard__date">DATE
                  <input type="date" min={first} value={customDate[k]} onChange={(e) => setCustomDate((c) => ({ ...c, [k]: e.target.value }))} />
                </label>
              )}
            </fieldset>

            <fieldset className="a-capcard__from">
              <legend>HOW MANY DAYS?</legend>
              <div className="a-chips">
                <button type="button" aria-pressed={scope[k] === "one"} onClick={() => setScope((c) => ({ ...c, [k]: "one" }))}>ONLY THIS DAY</button>
                <button type="button" aria-pressed={scope[k] === "onward"} onClick={() => setScope((c) => ({ ...c, [k]: "onward" }))}>THIS DAY &amp; EVERY DAY AFTER</button>
              </div>
              <p className="a-capcard__hint">
                {scope[k] === "one"
                  ? <>Only <b>{day ? shortDate(day) : ""}</b> changes. Every other day stays as it is.</>
                  : <>From <b>{day ? shortDate(day) : ""}</b> every day uses this number until you change it again.</>}
              </p>
            </fieldset>

            <p className="a-capcard__floor">
              {floor.claimed > 0
                ? <>Already booked: <b>{floor.claimed}</b> on {shortDate(floor.date!)}. You can&apos;t go below that.</>
                : "Nothing is booked for that, so you can choose any number."}
            </p>

            {errs[`limit-${k}`] && <p className="form__error" role="alert">{errs[`limit-${k}`]}</p>}
            <button type="button" className="a-btn a-btn--go a-capcard__save" onClick={() => review(k)} disabled={draft[k] === ""}>
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
          <label>FIRST DAY<input type="date" min={first} value={sp.from} onChange={(e) => setSp((s) => ({ ...s, from: e.target.value, to: s.to < e.target.value ? e.target.value : s.to }))} /></label>
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
            <p>{pending.end === null ? <>For <b>{pending.label}</b> <b>and every day after it</b> (until you change it again).</> : pending.end === pending.start ? <>For <b>{pending.label} only</b>. No other day changes.</> : <>For <b>{pending.label}</b> only. No other day changes.</>}</p>
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

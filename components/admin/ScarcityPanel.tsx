"use client";

import { useCallback, useEffect, useState } from "react";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import type { ScarcityOverview } from "@/lib/admin-scarcity";
import { addDays, shortDate } from "@/lib/dates";
import { lockScroll } from "@/lib/scroll-lock";
import { MAX_MESSAGE, PRESET_MESSAGES, renderMessage, usesCount, type HoldOp } from "@/lib/scarcity";
import { ScarcityStrip } from "@/components/ScarcityStrip";

type Ov = Omit<ScarcityOverview, "audit"> & { audit: { id: string; at: string; actor: string; action: string; burger: BurgerKey | null; date: string | null; detail: string | null; previous: unknown; next: unknown }[] };
type Scope = "one" | "window";
interface Pending { burger: BurgerKey; op: HoldOp; amount: number; title: string; body: string }

const NAMES = Object.fromEntries(BURGER_KEYS.map((k) => [k, getBurger(k).shortName])) as Record<BurgerKey, string>;
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

const ACTION_LABEL: Record<string, string> = {
  scarcity_enabled: "Scarcity mode turned ON",
  scarcity_disabled: "Scarcity mode turned OFF",
  message_changed: "Public message changed",
  low_threshold_changed: "Low-stock number changed",
  availability_set: "Public availability set",
  stock_reserved: "Stock hidden from the public",
  stock_released: "Hidden stock released",
  marked_sold_out: "Marked as sold out",
  availability_restored: "All remaining stock made available",
};

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

function change(a: { previous: unknown; next: unknown }): string {
  const p = a.previous as Record<string, unknown> | null;
  const n = a.next as Record<string, unknown> | null;
  if (!p || !n) return "";
  const k = Object.keys(n)[0];
  if (!k || k === "days") return "";
  const f = (v: unknown) => (typeof v === "boolean" ? (v ? "ON" : "OFF") : String(v));
  return k === "message" ? `“${f(p[k])}” → “${f(n[k])}”` : `${k.replace("_", " ")}: ${f(p[k])} → ${f(n[k])}`;
}

export function ScarcityPanel() {
  const [ov, setOv] = useState<Ov | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [date, setDate] = useState<string>("");
  const [scope, setScope] = useState<Scope>("one");
  const [draft, setDraft] = useState<{ enabled: boolean; message: string; low: string } | null>(null);
  const [setTo, setSetTo] = useState<Record<BurgerKey, string>>({ cheese: "", nashville: "" });
  const [custom, setCustom] = useState<Record<BurgerKey, string>>({ cheese: "", nashville: "" });
  const [busy, setBusy] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [previewBurger, setPreviewBurger] = useState<BurgerKey>("cheese");

  const adopt = useCallback((out: Ov, resetDraft: boolean) => {
    setOv(out);
    setDate(out.date);
    setLoadErr("");
    if (resetDraft) setDraft({ enabled: out.settings.enabled, message: out.settings.message, low: String(out.settings.low_threshold) });
  }, []);

  const load = useCallback(async (d?: string, resetDraft = false) => {
    try {
      const res = await fetch(`/api/admin/scarcity${d ? `?date=${d}` : ""}`, { cache: "no-store" });
      if (res.status === 401) { location.reload(); return; }
      const out = await res.json();
      if (!res.ok) { setLoadErr(out?.message ?? "Couldn't load Scarcity Control."); return; }
      adopt(out, resetDraft);
    } catch {
      setLoadErr("Couldn't load Scarcity Control. Please try again.");
    }
  }, [adopt]);

  useEffect(() => { void load(undefined, true); }, [load]);

  // keep the numbers fresh while the tab is open (customers are booking)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !busy && !pending) void load(date || undefined); }, 15000);
    return () => clearInterval(t);
  }, [load, date, busy, pending]);

  useEffect(() => {
    if (!pending) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setPending(null);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); unlock(); };
  }, [pending, busy]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  async function post(url: string, body: unknown): Promise<{ ok: boolean; out: Ov & { message?: string; days?: number; clamped?: number } }> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) { location.reload(); }
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok && out?.ok, out };
  }

  async function runHold(burger: BurgerKey, op: HoldOp, amount: number) {
    if (!ov) return;
    setBusy(`${burger}:${op}`);
    setErrs((e) => ({ ...e, [burger]: "" }));
    try {
      const { ok, out } = await post("/api/admin/scarcity/hold", { burger, date: ov.date, scope, op, amount });
      if (!ok) { setErrs((e) => ({ ...e, [burger]: out?.message ?? "Something went wrong. Please try again." })); return; }
      adopt(out, false);
      setNotice(`${NAMES[burger]} updated${scope === "window" ? ` for ${out.days} days${out.clamped ? ` (${out.clamped} limited to what was possible)` : ""}` : ""}.`);
      setSetTo((s) => ({ ...s, [burger]: "" }));
      setCustom((s) => ({ ...s, [burger]: "" }));
    } catch {
      setErrs((e) => ({ ...e, [burger]: "Something went wrong. Please try again." }));
    } finally {
      setBusy("");
    }
  }

  /** Sold out, "make everything available" and anything over many days ask first; the rest happen straight away. */
  function ask(burger: BurgerKey, op: HoldOp, amount = 0) {
    if (!ov) return;
    const days = scope === "window" ? "this day and every open day after it" : shortDate(ov.date);
    const needsConfirm = op === "sold_out" || scope === "window";
    if (!needsConfirm) { void runHold(burger, op, amount); return; }
    const what: Record<HoldOp, string> = {
      set_available: `Make ${amount} ${NAMES[burger]} available to the public`,
      hold: `Hide ${amount} ${NAMES[burger]} from the public`,
      release: `Give ${amount} hidden ${NAMES[burger]} back to the public`,
      sold_out: `Mark ${NAMES[burger]} as SOLD OUT for the public`,
      restore: `Make all remaining ${NAMES[burger]} available`,
    };
    setPending({
      burger, op, amount,
      title: what[op],
      body: `For ${days}. Bookings that are already confirmed are not touched${op === "sold_out" ? ", and the hidden burgers are kept (not sold) — you can release them any time" : ""}.`,
    });
  }

  async function saveSettings() {
    if (!draft || !ov) return;
    const low = Number(draft.low);
    if (draft.low === "" || !Number.isInteger(low) || low < 0 || low > 1000) { setErrs((e) => ({ ...e, settings: "The low-stock number must be a whole number from 0 to 1000." })); return; }
    if (!draft.message.trim()) { setErrs((e) => ({ ...e, settings: "Write a message, or pick one of the presets." })); return; }
    setBusy("settings");
    setErrs((e) => ({ ...e, settings: "" }));
    try {
      const { ok, out } = await post("/api/admin/scarcity/settings", { enabled: draft.enabled, message: draft.message, low_threshold: low, date: ov.date });
      if (!ok) { setErrs((e) => ({ ...e, settings: out?.message ?? "Something went wrong. Please try again." })); return; }
      adopt(out, true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setNotice(draft.enabled ? "Scarcity mode is ON. Customers see it now." : "Scarcity mode is OFF. Customers see the real remaining count.");
    } catch {
      setErrs((e) => ({ ...e, settings: "Something went wrong. Please try again." }));
    } finally {
      setBusy("");
    }
  }

  if (loadErr && !ov) return <p className="form__error" role="alert">{loadErr}</p>;
  if (!ov || !draft) return <p className="admin-note">Loading…</p>;

  const dirty =
    draft.enabled !== ov.settings.enabled || draft.message !== ov.settings.message || draft.low !== String(ov.settings.low_threshold);
  const first = ov.firstBookable ?? ov.today;
  const dayLabel = (d: string) => (d === ov.today ? "TODAY" : d === addDays(ov.today, 1) ? "TOMORROW" : shortDate(d));
  const pv = ov.burgers[previewBurger];
  const lowN = Number(draft.low);

  return (
    <section className="a-scar" aria-label="Scarcity Control">
      <p className="a-cap__intro">
        Hide part of a day&apos;s burgers from customers so the drop feels limited. Hidden burgers are <b>kept, not sold</b> — you can release them any time.
        Existing bookings are never changed.
      </p>

      {/* which day / how many days */}
      <div className="a-scar__scope">
        <fieldset className="a-capcard__from">
          <legend>WHICH DAY?</legend>
          <div className="a-chips">
            {[first, addDays(first, 1)].map((d) => (
              <button key={d} type="button" aria-pressed={ov.date === d} onClick={() => void load(d)}>{dayLabel(d)}</button>
            ))}
            <button type="button" aria-pressed={ov.date !== first && ov.date !== addDays(first, 1)} onClick={() => void load(addDays(first, 2))}>A DATE…</button>
          </div>
          {ov.date !== first && ov.date !== addDays(first, 1) && (
            <label className="a-capcard__date">DATE
              <input type="date" min={first} max={ov.windowEnd} value={date} onChange={(e) => e.target.value && void load(e.target.value)} />
            </label>
          )}
        </fieldset>
        <fieldset className="a-capcard__from">
          <legend>HOW MANY DAYS?</legend>
          <div className="a-chips">
            <button type="button" aria-pressed={scope === "one"} onClick={() => setScope("one")}>ONLY THIS DAY</button>
            <button type="button" aria-pressed={scope === "window"} onClick={() => setScope("window")}>THIS DAY &amp; EVERY DAY AFTER</button>
          </div>
          <p className="a-capcard__hint">
            {scope === "one" ? <>Changes apply to <b>{shortDate(ov.date)}</b> only.</> : <>Changes apply to <b>{shortDate(ov.date)}</b> and every open day after it (each day is checked on its own).</>}
          </p>
        </fieldset>
      </div>

      {/* one card per burger */}
      <div className="a-scar__cards">
        {BURGER_KEYS.map((k) => {
          const b = ov.burgers[k];
          const n = Number(setTo[k]);
          const c = Number(custom[k]);
          const lock = !!busy;
          return (
            <div key={k} className={`a-capcard a-capcard--${k}`}>
              <header className="a-capcard__head">
                <h3>{NAMES[k]}</h3>
                <p className="a-scar__day">{shortDate(ov.date)}</p>
              </header>

              <dl className="a-stats">
                <div><dt>TOTAL STOCK</dt><dd>{b.stock}</dd></div>
                <div><dt>ALREADY BOOKED</dt><dd>{b.booked}</dd></div>
                <div><dt>ADMIN RESERVED</dt><dd>{b.held}</dd></div>
                <div data-key><dt>AVAILABLE TO BOOK</dt><dd>{b.available}</dd></div>
                <div><dt>BOOKINGS LEFT</dt><dd>{b.bookingsLeft.min === b.bookingsLeft.max ? b.bookingsLeft.max : `${b.bookingsLeft.min}–${b.bookingsLeft.max}`}</dd></div>
                <div><dt>SCARCITY MODE</dt><dd data-on={ov.settings.enabled || undefined}>{ov.settings.enabled ? "ON" : "OFF"}</dd></div>
              </dl>
              {!ov.settings.enabled && b.held > 0 && (
                <p className="a-capcard__floor">Scarcity mode is OFF, so the {b.held} hidden burger{b.held === 1 ? "" : "s"} {b.held === 1 ? "is" : "are"} currently on sale. Turn it ON to hide {b.held === 1 ? "it" : "them"}.</p>
              )}

              <div className="a-scar__row">
                <label className="a-scar__label" htmlFor={`set-${k}`}>CUSTOM QUANTITY · AVAILABLE TO THE PUBLIC</label>
                <div className="a-scar__inline">
                  <input id={`set-${k}`} inputMode="numeric" placeholder={`0–${b.unallocated}`} value={setTo[k]} onChange={(e) => setSetTo((s) => ({ ...s, [k]: digits(e.target.value) }))} aria-invalid={!!errs[k]} />
                  <button type="button" className="a-btn a-btn--go" disabled={lock || setTo[k] === "" || n > b.unallocated} onClick={() => ask(k, "set_available", n)}>
                    {busy === `${k}:set_available` ? "SAVING…" : "SET"}
                  </button>
                </div>
                {setTo[k] !== "" && n > b.unallocated && <p className="a-capcard__hint">Only {b.unallocated} {b.unallocated === 1 ? "burger is" : "burgers are"} unbooked, so {n} can&apos;t be made available.</p>}
              </div>

              <div className="a-scar__row">
                <p className="a-scar__label">QUICK ACTIONS</p>
                <div className="a-scar__quick">
                  {[5, 10, 20].map((q) => (
                    <button key={q} type="button" className="a-btn" disabled={lock || q > b.available} onClick={() => ask(k, "hold", q)}>HIDE {q} BURGERS</button>
                  ))}
                  <button type="button" className="a-btn" disabled={lock || b.held === 0} onClick={() => ask(k, "restore")}>MAKE ALL REMAINING STOCK AVAILABLE</button>
                  <button type="button" className="a-btn a-btn--danger" disabled={lock || b.available === 0} onClick={() => ask(k, "sold_out")}>MARK AS SOLD OUT</button>
                </div>
              </div>

              <div className="a-scar__row">
                <label className="a-scar__label" htmlFor={`cus-${k}`}>HIDE OR RELEASE A NUMBER</label>
                <div className="a-scar__inline a-scar__inline--3">
                  <input id={`cus-${k}`} inputMode="numeric" placeholder="e.g. 15" value={custom[k]} onChange={(e) => setCustom((s) => ({ ...s, [k]: digits(e.target.value) }))} />
                  <button type="button" className="a-btn" disabled={lock || custom[k] === "" || c < 1 || c > b.available} onClick={() => ask(k, "hold", c)}>HIDE</button>
                  <button type="button" className="a-btn" disabled={lock || custom[k] === "" || c < 1 || b.held === 0} onClick={() => ask(k, "release", c)}>RELEASE</button>
                </div>
                {custom[k] !== "" && c > b.available && <p className="a-capcard__hint">Only {b.available} can be hidden — that&apos;s all that&apos;s left for the public.</p>}
              </div>

              {errs[k] && <p className="form__error" role="alert">{errs[k]}</p>}
            </div>
          );
        })}
      </div>

      {/* master switch, message, threshold */}
      <div className="a-capcard a-scar__settings">
        <header className="a-capcard__head"><h3>SCARCITY MODE</h3></header>
        <div className="a-switch">
          <button type="button" role="switch" aria-checked={draft.enabled} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} className="a-switch__btn">
            <span className="a-switch__knob" aria-hidden />
          </button>
          <p><b>{draft.enabled ? "ON" : "OFF"}</b> — {draft.enabled ? "customers see only the burgers you leave available, plus your message." : "customers see the real number of burgers left. Hidden burgers are ignored (not deleted)."}</p>
        </div>

        <fieldset className="a-capcard__from">
          <legend>MESSAGE ON THE BOOKING PAGE</legend>
          <div className="a-presets" role="radiogroup" aria-label="Preset messages">
            {PRESET_MESSAGES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={draft.message === m} onClick={() => setDraft({ ...draft, message: m })}>{m}</button>
            ))}
          </div>
          <label className="a-capcard__date">OR WRITE YOUR OWN
            <input value={draft.message} maxLength={MAX_MESSAGE} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          </label>
          <p className="a-capcard__hint">{draft.message.length}/{MAX_MESSAGE} · <code>{"{count}"}</code> is replaced by the live number of burgers customers can book.</p>
        </fieldset>

        <label className="a-capcard__date">URGENT WHEN FEWER THAN OR EXACTLY THIS MANY ARE LEFT
          <input inputMode="numeric" value={draft.low} onChange={(e) => setDraft({ ...draft, low: digits(e.target.value) })} />
        </label>

        {errs.settings && <p className="form__error" role="alert">{errs.settings}</p>}
        <button type="button" className="a-btn a-btn--go a-capcard__save" onClick={saveSettings} disabled={!dirty || busy === "settings"}>
          {busy === "settings" ? "SAVING…" : saved ? "SAVED ✓" : "SAVE SETTINGS"}
        </button>
      </div>

      {/* live preview */}
      <div className="a-capcard a-scar__preview">
        <header className="a-capcard__head"><h3>LIVE PREVIEW</h3></header>
        <div className="a-chips" role="group" aria-label="Preview burger">
          {BURGER_KEYS.map((k) => <button key={k} type="button" aria-pressed={previewBurger === k} onClick={() => setPreviewBurger(k)}>{NAMES[k]}</button>)}
        </div>
        <div className="a-scar__phone" aria-label="What customers will see">
          <p className="a-scar__ph-k">{getBurger(previewBurger).name}</p>
          <p className="a-scar__ph-d">{shortDate(ov.date)}</p>
          {draft.enabled ? (
            <ScarcityStrip scarcity={{ on: true, message: draft.message || "…", low: Number.isFinite(lowN) ? lowN : 0 }} remaining={pv.availableIfOn} />
          ) : (
            <p className="a-scar__ph-off">Scarcity mode is OFF — customers see the real count: <b>{pv.unallocated} left</b>.</p>
          )}
          <div className="a-scar__ph-btn" aria-hidden data-off={pv.availableIfOn === 0 && draft.enabled || pv.unallocated === 0 || undefined}>
            {(draft.enabled ? pv.availableIfOn : pv.unallocated) === 0 ? "SOLD OUT" : "RESERVE MY BURGER →"}
          </div>
        </div>
        <p className="a-capcard__hint">
          Example of the wording: “{renderMessage(draft.message, pv.availableIfOn)}”{!usesCount(draft.message) ? " (no {count} in this message)" : ""}
        </p>
      </div>

      {/* what's currently hidden */}
      <div className="a-rules">
        <h3>STOCK CURRENTLY HIDDEN</h3>
        {ov.heldDays.length === 0 ? (
          <p className="admin-note">Nothing is hidden. Every unbooked burger is available to customers.</p>
        ) : (
          <ul>
            {ov.heldDays.map((h) => (
              <li key={`${h.burger}|${h.date}`}>
                <span className={`a-burger a-burger--${h.burger}`}>{NAMES[h.burger]}</span>
                <b className="a-rules__n">{h.held} hidden</b>
                <span className="a-rules__range">{shortDate(h.date)}</span>
                <button type="button" className="a-btn a-rules__rm" onClick={() => void load(h.date)}>VIEW</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* audit log */}
      <div className="a-rules">
        <h3>RECENT CHANGES</h3>
        {ov.audit.length === 0 ? (
          <p className="admin-note">No changes yet.</p>
        ) : (
          <ul className="a-audit">
            {ov.audit.map((a) => (
              <li key={a.id}>
                <span className="a-audit__when">{when(a.at)}</span>
                <b>{ACTION_LABEL[a.action] ?? a.action}</b>
                {a.detail && <span className="a-audit__detail">{a.detail}</span>}
                {change(a) && <span className="a-audit__detail">{change(a)}</span>}
                <span className="a-audit__who">by {a.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {notice && <p className="a-toast" role="status">{notice}</p>}

      {pending && (
        <div className="a-modal" role="dialog" aria-modal="true" aria-labelledby="scar-dlg" onClick={(e) => e.target === e.currentTarget && !busy && setPending(null)}>
          <div className="a-modal__box">
            <h2 id="scar-dlg">{pending.title.toUpperCase()}?</h2>
            <p>{pending.body}</p>
            <div className="a-modal__actions">
              <button className="a-btn" onClick={() => setPending(null)} disabled={!!busy} autoFocus>CANCEL</button>
              <button className="a-btn a-btn--go" disabled={!!busy} onClick={async () => { const p = pending; await runHold(p.burger, p.op, p.amount); setPending(null); }}>
                {busy ? "SAVING…" : "YES, DO IT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

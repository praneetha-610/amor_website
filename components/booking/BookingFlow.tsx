"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BURGER_KEYS, formatPrice, getBurger, reservationTotal, siteConfig, type BurgerKey } from "@/config/site";
import type { AvailabilityPayload, DayAvailability } from "@/lib/inventory";
import { monthDay, relativeLabel, shortDate } from "@/lib/dates";
import { MESSAGES } from "@/lib/messages";
import { isValidMobile, isValidName, normalizeMobile, sanitizeName } from "@/lib/validation";
import { firstBookableDay } from "../availability-utils";
import { inventoryCopy, statusText } from "../inventory-copy";
import type { TicketData } from "../ReservationTicket";
import { ConfirmedModal } from "./ConfirmedModal";
import { applyLocalBooking, refreshAvailability, useAvailability } from "../useAvailability";

const STATUS_ICON = { available: "●", limited: "◐", sold_out: "✕", closed: "✕" } as const;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-xxxxxxxx`;
}

function firstOpen(days: DayAvailability[], burger: BurgerKey, preferred?: string): string {
  const ok = (d?: DayAvailability) => !!d && d.bookable && d.burgers[burger].remaining > 0;
  const pref = preferred ? days.find((d) => d.date === preferred) : undefined;
  if (ok(pref)) return pref!.date;
  return days.find((d) => ok(d))?.date ?? "";
}

interface Props {
  /** Burger pages lock the burger. /reserve lets the customer choose. */
  fixedBurger?: BurgerKey;
  initial: AvailabilityPayload;
  initialBurger?: BurgerKey;
  initialDate?: string;
}

export function BookingFlow({ fixedBurger, initial, initialBurger, initialDate }: Props) {
  const data = useAvailability(initial);
  const uid = useId();

  const [burger, setBurger] = useState<BurgerKey>(fixedBurger ?? initialBurger ?? "cheese");
  const [date, setDate] = useState<string>(() => firstOpen(initial.days, fixedBurger ?? initialBurger ?? "cheese", initialDate));
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [qty, setQty] = useState(1);
  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState("");
  const [fields, setFields] = useState<Partial<Record<"name" | "mobile", string>>>({});
  const [formError, setFormError] = useState<{ message: string; code?: string } | null>(null);
  const [race, setRace] = useState(false);
  const [phase, setPhase] = useState<"idle" | "submitting" | "done">("idle");
  const [ticket, setTicket] = useState<{ data: TicketData; url: string } | null>(null);
  const [showTicket, setShowTicket] = useState(false);

  const idemKey = useRef(newKey());
  const lock = useRef(false);
  const datesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const [nudge, setNudge] = useState<{ to: "form" | "dates"; n: number } | null>(null);

  const cfg = getBurger(burger);
  const showBoth = !fixedBurger;
  const day = data.days.find((d) => d.date === date);
  const avail = day?.burgers[burger];
  const maxQty = Math.max(1, Math.min(siteConfig.maximumQuantityPerCustomer, avail?.remaining ?? 1));

  // Pick a sensible date once real data arrives (e.g. the server render had none).
  useEffect(() => {
    if (!date && !race) setDate(firstOpen(data.days, burger, initialDate));
  }, [data.days, date, race, burger, initialDate]);

  // The window rolls over at 12:00 AM India time. If the selected date has dropped out of it
  // (tab left open overnight) or has closed, move to the first open date instead of booking a stale one.
  useEffect(() => {
    if (!date || race) return;
    const d = data.days.find((x) => x.date === date);
    if (!d || !d.bookable) setDate(firstOpen(data.days, burger));
  }, [data.days, date, race, burger]);

  // Keep quantity valid as inventory changes.
  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [qty, maxQty]);

  // On phones the next step sits below the fold — bring it into view after each tap.
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => {
      const el = nudge.to === "form" ? formRef.current : datesRef.current;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 140);
    return () => clearTimeout(t);
  }, [nudge]);

  const isSoldOut = !!avail && avail.remaining <= 0;
  const noDates = !firstBookableDay(data);

  function chooseBurger(b: BurgerKey) {
    setNudge((x) => ({ to: "dates", n: (x?.n ?? 0) + 1 }));
    setBurger(b);
    setRace(false);
    setFormError(null);
    idemKey.current = newKey();
    const d = data.days.find((x) => x.date === date);
    if (!d || d.burgers[b].remaining <= 0) setDate(firstOpen(data.days, b));
  }

  function chooseDate(d: string) {
    setNudge((x) => ({ to: "form", n: (x?.n ?? 0) + 1 })); // even re-tapping the pre-selected date moves on
    setDate(d);
    setRace(false);
    setFormError(null);
    idemKey.current = newKey();
  }

  function validate() {
    const f: typeof fields = {};
    if (!isValidName(sanitizeName(name))) f.name = MESSAGES.INVALID_NAME;
    if (!isValidMobile(normalizeMobile(mobile))) f.mobile = MESSAGES.INVALID_MOBILE;
    setFields(f);
    if (!consent) setConsentErr(siteConfig.noShowConsent.error);
    // On a phone the button is far below the fields — jump to the first problem so it never feels like "nothing happened".
    const first = f.name ? nameRef.current : f.mobile ? mobileRef.current : !consent ? consentRef.current : null;
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.focus({ preventScroll: true });
    }
    return Object.keys(f).length === 0 && consent;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || phase !== "idle" || !date || isSoldOut || !consent) return;
    setFormError(null);
    if (!validate()) return;

    lock.current = true;
    setPhase("submitting");
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          burger,
          date,
          name: sanitizeName(name),
          mobile: normalizeMobile(mobile),
          quantity: qty,
          consent: true, // verified again server-side; stored with a timestamp
          idempotencyKey: idemKey.current,
        }),
      });
      const out = await res.json().catch(() => null);

      if (res.ok && out?.ok) {
        applyLocalBooking(burger, date, qty); // the count drops right away
        const r = out.reservation;
        setTicket({
          url: out.url,
          data: { reservationId: r.reservationId, name: r.name, burger: r.burger, date: r.date, quantity: r.quantity, total: r.total, unitPrice: r.unitPrice, status: r.status },
        });
        setShowTicket(true); // the confirmation pop-up with the reservation ID
        setPhase("done");
        return; // stay locked until the pop-up is closed: a second tap must never create a second booking
      }

      const code: string = out?.code ?? "SERVER";
      if (code === "SOLD_OUT") {
        setRace(true);
        setDate("");
        void refreshAvailability();
      } else if (code === "NOT_ENOUGH" || code === "DATE_UNAVAILABLE") {
        void refreshAvailability();
        setFormError({ message: out.message, code });
      } else if (code === "VALIDATION" && out?.fieldErrors) {
        setFields({ name: out.fieldErrors.name, mobile: out.fieldErrors.mobile });
        (out.fieldErrors.name ? nameRef.current : out.fieldErrors.mobile ? mobileRef.current : null)?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (out.fieldErrors.consent) setConsentErr(out.fieldErrors.consent);
        setFormError({ message: out.message, code });
      } else {
        setFormError({ message: out?.message ?? MESSAGES.SERVER, code });
      }
    } catch {
      setFormError({ message: MESSAGES.SERVER, code: "SERVER" });
    }
    lock.current = false;
    setPhase("idle");
  }

  function closeTicket() {
    setShowTicket(false);
    // fresh form for a possible next booking; a new idempotency key so it can't replay the old one
    setName(""); setMobile(""); setQty(1); setConsent(false); setConsentErr(""); setFields({}); setFormError(null);
    idemKey.current = newKey();
    lock.current = false;
    setPhase("idle");
    void refreshAvailability();
    setNudge({ to: "dates", n: Date.now() });
  }

  function backToDates() {
    setRace(false);
    datesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const submitting = phase !== "idle";
  const dateTitle = useMemo(() => (date ? monthDay(date) : ""), [date]);

  return (
    <div className={`booking theme-${burger}`} data-burger={burger}>
      {showTicket && ticket && <ConfirmedModal ticket={ticket.data} url={ticket.url} onClose={closeTicket} />}

      {/* after the pop-up is closed, the ticket stays one tap away */}
      {!showTicket && ticket && (
        <div className="reserved-strip" role="status">
          <span>✓ Reserved · <b>{ticket.data.reservationId}</b></span>
          <button type="button" onClick={() => setShowTicket(true)}>VIEW TICKET</button>
        </div>
      )}

      {/* STEP 1 — burger (only when not locked to a burger page) */}
      {showBoth && (
        <section className="step" aria-labelledby={`${uid}-s1`}>
          <h3 id={`${uid}-s1`} className="step__title"><span>1</span> CHOOSE YOUR BURGER</h3>
          <div className="picks" role="group" aria-label="Choose your burger">
            {BURGER_KEYS.map((k) => {
              const b = getBurger(k);
              // nearest date that still has this burger — "SOLD OUT" only when every open date is gone
              const dayK = data.days.find((x) => x.bookable && x.burgers[k].remaining > 0);
              const d0 = dayK?.burgers[k];
              const c = d0 ? inventoryCopy(d0.remaining, d0.limit) : null;
              const when = dayK ? relativeLabel(dayK.date, data.today) : "";
              return (
                <button
                  key={k}
                  type="button"
                  className={`pick pick--${k}`}
                  aria-pressed={burger === k}
                  onClick={() => chooseBurger(k)}
                >
                  <span className="pick__name">{b.name}</span>
                  <span className="pick__meta">
                    {formatPrice(b.price)} · {c ? `${c.headline} ${when}` : data.days.length ? "SOLD OUT" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* STEP — date */}
      <section className="step" aria-labelledby={`${uid}-s2`} ref={datesRef}>
        <h3 id={`${uid}-s2`} className="step__title">
          <span>{showBoth ? 2 : 1}</span> CHOOSE YOUR DATE
        </h3>

        {noDates ? (
          <p className="notice" role="status">{MESSAGES.DATE_UNAVAILABLE}</p>
        ) : (
          <div className="dates" role="group" aria-label="Available dates">
            {data.days.map((d) => {
              const mine = d.burgers[burger];
              const selected = d.date === date;
              const closed = !d.bookable; // e.g. today, after the cutoff
              const disabled = closed || mine.remaining <= 0;
              const status = closed ? "closed" : mine.status;
              return (
                <button
                  key={d.date}
                  type="button"
                  className="date"
                  data-selected={selected || undefined}
                  data-status={status}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => chooseDate(d.date)}
                >
                  <span className="date__rel">{relativeLabel(d.date, data.today)}</span>
                  <span className="date__d">{shortDate(d.date)}</span>

                  {showBoth ? (
                    <span className="date__rows">
                    {BURGER_KEYS.map((k) => {
                      const a = d.burgers[k];
                      return (
                        <span key={k} className="date__row" data-mine={k === burger || undefined} data-burger={k}>
                          <span className="date__lbl">{getBurger(k).shortName}</span>
                          <b>{closed ? "CLOSED" : a.remaining <= 0 ? "SOLD OUT" : `${a.remaining} LEFT`}</b>
                        </span>
                      );
                    })}
                    </span>
                  ) : (
                    <span className="date__left">{closed ? "CLOSED" : mine.remaining <= 0 ? "SOLD OUT" : `${mine.remaining} LEFT`}</span>
                  )}

                  <span className="tag" data-status={status}>
                    <span aria-hidden>{STATUS_ICON[status]}</span> {closed ? "CLOSED FOR TODAY" : statusText(mine.status)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="legend">
          <span><span aria-hidden>●</span> AVAILABLE</span>
          <span><span aria-hidden>◐</span> LIMITED</span>
          <span><span aria-hidden>✕</span> SOLD OUT</span>
        </p>
      </section>

      {/* Lost the last burger to someone else a moment ago */}
      {race && (
        <div className="race" role="alert">
          <p className="race__title">{MESSAGES.LAST_ONE_GONE}</p>
          <p>{MESSAGES.LAST_ONE_GONE_SUB}</p>
          <button type="button" className="btn btn--ink" onClick={backToDates}>CHOOSE ANOTHER DATE</button>
        </div>
      )}

      {/* STEP — details */}
      {date && avail && !race && (
        <section className="step step--form" aria-labelledby={`${uid}-s3`} key={`${burger}-${date}`} ref={formRef}>
          <h3 id={`${uid}-s3`} className="step__title"><span>{showBoth ? 3 : 2}</span> YOUR DETAILS</h3>

          <div className="picked" aria-live="polite">
            <p className="picked__burger">{cfg.name}</p>
            <p className="picked__date">{dateTitle}</p>
            <p className="picked__left" data-urgent={inventoryCopy(avail.remaining, avail.limit).urgent || undefined}>
              {isSoldOut ? "SOLD OUT" : inventoryCopy(avail.remaining, avail.limit).headline}
            </p>
          </div>

          {isSoldOut ? (
            <div className="race" role="alert">
              <p className="race__title">{MESSAGES.SOLD_OUT_DATE}</p>
              <p>Choose another date to claim yours.</p>
              <button type="button" className="btn btn--ink" onClick={backToDates}>CHOOSE ANOTHER DATE</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="form">
              <div className="field">
                <span className="field__label" id={`${uid}-qty-l`}>QUANTITY</span>
                <div className="qty" role="group" aria-labelledby={`${uid}-qty-l`}>
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1 || submitting} aria-label="Fewer burgers">−</button>
                  <output aria-live="polite">{qty}</output>
                  <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty || submitting} aria-label="More burgers">+</button>
                  <span className="qty__note">
                    {maxQty === 1 && avail.remaining === 1 ? "LAST ONE" : `MAX ${maxQty} PER CUSTOMER`}
                  </span>
                </div>
              </div>

              <div className="field">
                <label htmlFor={`${uid}-name`}>FULL NAME</label>
                <input
                  id={`${uid}-name`}
                  ref={nameRef}
                  name="name"
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!fields.name}
                  aria-describedby={fields.name ? `${uid}-name-err` : undefined}
                  disabled={submitting}
                  required
                />
                {fields.name && <p id={`${uid}-name-err`} className="field__err">{fields.name}</p>}
              </div>

              <div className="field">
                <label htmlFor={`${uid}-mobile`}>MOBILE NUMBER</label>
                <div className="field__phone">
                  <span aria-hidden>+91</span>
                  <input
                    id={`${uid}-mobile`}
                    ref={mobileRef}
                    name="mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    maxLength={16}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/[^\d+\s-]/g, ""))}
                    aria-invalid={!!fields.mobile}
                    aria-describedby={fields.mobile ? `${uid}-mobile-err` : undefined}
                    disabled={submitting}
                    required
                  />
                </div>
                {fields.mobile && <p id={`${uid}-mobile-err`} className="field__err">{fields.mobile}</p>}
              </div>

              {/* REVIEW — what the customer is committing to */}
              <section className="review" aria-label="Your reservation">
                <h4 className="review__title">YOUR RESERVATION</h4>
                <p className="review__burger">{cfg.name}</p>
                <dl className="review__rows">
                  <div><dt>Date</dt><dd>{dateTitle}</dd></div>
                  <div><dt>Quantity</dt><dd>{qty}</dd></div>
                  <div><dt>Price</dt><dd>{formatPrice(cfg.price)}{qty > 1 ? " each" : ""}</dd></div>
                  <div className="review__total"><dt>TOTAL</dt><dd>{formatPrice(reservationTotal(burger, qty))}</dd></div>
                </dl>
                <p className="review__pay">{siteConfig.paymentNote}</p>
              </section>

              {/* MANDATORY CONSENT — button stays disabled until ticked; the server re-checks it */}
              <div className="consent" data-invalid={!!consentErr || undefined}>
                <label className="consent__box" htmlFor={`${uid}-consent`}>
                  <input
                    id={`${uid}-consent`}
                    ref={consentRef}
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); if (e.target.checked) setConsentErr(""); }}
                    aria-required="true"
                    aria-describedby={`${uid}-consent-note${consentErr ? ` ${uid}-consent-err` : ""}`}
                    disabled={submitting}
                  />
                  <span className="consent__tick" aria-hidden />
                  <span className="consent__label">{siteConfig.noShowConsent.label}</span>
                </label>
                <p id={`${uid}-consent-note`} className="consent__note">{siteConfig.noShowConsent.note}</p>
                {consentErr && <p id={`${uid}-consent-err`} className="field__err" role="alert">{consentErr}</p>}
              </div>

              {formError && (
                <div className="form__error" role="alert">
                  <p>{formError.message}</p>
                  {formError.code === "DUPLICATE" && (
                    <Link href="/my-reservation">Find my reservation →</Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="btn btn--submit btn--xl btn--block"
                disabled={submitting || !consent}
                aria-busy={submitting}
                aria-describedby={!consent ? `${uid}-consent-hint` : undefined}
              >
                {submitting ? (
                  <><span className="spinner" aria-hidden /> {phase === "done" ? "CLAIMED ✓" : "CLAIMING YOURS…"}</>
                ) : (
                  <>{cfg.cta.reserve} <span className="arrow" aria-hidden>→</span></>
                )}
              </button>

              {!consent && <p id={`${uid}-consent-hint`} className="form__hint">Tick the box above to reserve your burger.</p>}

              <p className="form__promise">
                <strong>Your burger will be prepared and held specifically for your reservation.</strong>
                <br />
                Reservations are valid only for the selected date.
              </p>
              <p className="form__consent">{siteConfig.consentLine}</p>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

-- ════════════════════════════════════════════════════════════════
--  MIGRATION 002 — no-show consent + price snapshot
--  For the EXISTING (already live) database. Safe to re-run.
--
--  ORDER OF OPERATIONS (so the live site never breaks):
--   1. Run THIS file in Supabase → SQL Editor.   (old site keeps working)
--   2. Deploy the new code to Vercel.
--   3. Run supabase/migrations/003_drop_old_book_burger.sql   (closes the no-consent loophole)
-- ════════════════════════════════════════════════════════════════

alter table public.reservations
  add column if not exists consent_accepted    boolean     not null default false,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists unit_price          int;          -- ₹ per burger at booking time (null = booked before snapshots)

comment on column public.reservations.consent_accepted    is 'Customer ticked: agrees to pay even if they do not show up.';
comment on column public.reservations.consent_accepted_at is 'Server timestamp of that consent.';

-- New booking function (adds p_consent + p_unit_price). It coexists with the old
-- 9-argument version until step 3, so the old deployment keeps working meanwhile.
create or replace function public.book_burger(
  p_reservation_id  text,
  p_burger          text,
  p_date            date,
  p_name            text,
  p_mobile          text,
  p_quantity        int,
  p_daily_limit     int,
  p_max_qty         int,
  p_idempotency_key text,
  p_consent         boolean,
  p_unit_price      int
) returns jsonb
language plpgsql security invoker as $$
declare
  v_claimed  int;
  v_existing public.reservations;
  v_row      public.reservations;
begin
  -- Consent is enforced in the database too, not just in the app.
  if p_consent is distinct from true then
    return jsonb_build_object('status', 'consent_required');
  end if;

  if p_quantity < 1 or p_quantity > p_max_qty then
    raise exception 'invalid quantity';
  end if;

  -- Serialize all bookings for this burger+date (prevents overbooking).
  perform pg_advisory_xact_lock(hashtextextended(p_burger || ':' || p_date::text, 0));

  if p_idempotency_key is not null then
    select * into v_existing from public.reservations where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('status', 'replayed', 'reservation', to_jsonb(v_existing) - 'idempotency_key');
    end if;
  end if;

  if exists (
    select 1 from public.reservations
    where mobile_number = p_mobile and burger_type = p_burger
      and reservation_date = p_date and status <> 'cancelled'
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select coalesce(sum(quantity), 0) into v_claimed
  from public.reservations
  where burger_type = p_burger and reservation_date = p_date and status <> 'cancelled';

  if v_claimed >= p_daily_limit then
    return jsonb_build_object('status', 'sold_out');
  end if;
  if v_claimed + p_quantity > p_daily_limit then
    return jsonb_build_object('status', 'not_enough', 'remaining', p_daily_limit - v_claimed);
  end if;

  begin
    insert into public.reservations
      (reservation_id, customer_name, mobile_number, burger_type, reservation_date, quantity,
       idempotency_key, consent_accepted, consent_accepted_at, unit_price)
    values
      (p_reservation_id, p_name, p_mobile, p_burger, p_date, p_quantity,
       p_idempotency_key, true, now(), p_unit_price)
    returning * into v_row;
  exception when unique_violation then
    return jsonb_build_object('status', 'retry');
  end;

  return jsonb_build_object('status', 'ok', 'reservation', to_jsonb(v_row) - 'idempotency_key');
end;
$$;

revoke all on function public.book_burger(text, text, date, text, text, int, int, int, text, boolean, int) from public, anon, authenticated;

-- Make Supabase's API pick up the new function immediately.
notify pgrst, 'reload schema';

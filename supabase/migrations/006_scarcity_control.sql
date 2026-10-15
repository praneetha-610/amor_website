-- 006 · Scarcity Control (hidden stock, settings, audit log). Safe to run more than once.

-- ════════════════════════════════════════════════════════════════
--  SCARCITY CONTROL — the owner can HIDE part of a day's stock from the public.
--  Four numbers are always kept apart (per burger, per date):
--    stock    = the day's limit (capacity_for)             — what is physically made
--    booked   = Σ non-cancelled reservations               — allocated to customers
--    held     = scarcity_holds.held (capped at stock-booked) — withheld by the owner (NOT sold)
--    public   = stock − booked − held   (while scarcity is ON; with it OFF the hold is ignored)
--  Nothing here ever edits or deletes a reservation.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.scarcity_settings (
  id            int primary key default 1 check (id = 1),     -- exactly one row
  enabled       boolean not null default false,
  message       text    not null default 'Limited Drop — Only {count} Burgers Left.' check (char_length(message) between 1 and 160),
  low_threshold int     not null default 5 check (low_threshold between 0 and 1000),
  updated_at    timestamptz not null default now()
);
insert into public.scarcity_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.scarcity_holds (
  burger_type text not null check (burger_type in ('cheese', 'nashville')),
  hold_date   date not null,
  held        int  not null check (held > 0 and held <= 1000),
  updated_at  timestamptz not null default now(),
  primary key (burger_type, hold_date)
);

-- Who changed what, and when (the dashboard has one shared admin login, so the actor is "admin").
create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  burger_type text,
  hold_date   date,
  previous    jsonb,
  new         jsonb,
  detail      text
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);

alter table public.scarcity_settings enable row level security;
alter table public.scarcity_holds    enable row level security;
alter table public.admin_audit       enable row level security;
revoke all on public.scarcity_settings from anon, authenticated;
revoke all on public.scarcity_holds    from anon, authenticated;
revoke all on public.admin_audit       from anon, authenticated;

-- Admin: change how many are held back for ONE burger on ONE date, inside the same locks the booking function uses,
-- so a hold can never be set underneath a booking that is happening right now.
--   set_available N : make exactly N available to the public      hold N    : hide N more
--   release N       : give N back to the public                    sold_out  : hide everything that is left
--   restore         : hide nothing
-- p_clamp = true → an impossible request is cut down to what is possible instead of refused (used for "every day").
create or replace function public.adjust_hold(p_burger text, p_date date, p_op text, p_amount int, p_default int, p_clamp boolean)
returns jsonb
language plpgsql security invoker as $$
declare
  v_limit   int;
  v_claimed int;
  v_unalloc int;
  v_cur     int;
  v_avail   int;
  v_new     int;
begin
  if p_op not in ('set_available', 'hold', 'release', 'sold_out', 'restore') then raise exception 'invalid op'; end if;
  if p_amount < 0 or p_amount > 1000 then raise exception 'invalid amount'; end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('cap:' || p_burger, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_burger || ':' || p_date::text, 0));

  v_limit := public.capacity_for(p_burger, p_date, p_default);
  select coalesce(sum(quantity), 0) into v_claimed
  from public.reservations
  where burger_type = p_burger and reservation_date = p_date and status <> 'cancelled';

  v_unalloc := greatest(0, v_limit - v_claimed);                       -- stock nobody has booked
  select coalesce(max(held), 0) into v_cur from public.scarcity_holds where burger_type = p_burger and hold_date = p_date;
  v_cur   := least(v_cur, v_unalloc);
  v_avail := v_unalloc - v_cur;                                        -- what the public could book right now

  if p_op = 'set_available' then
    if p_amount > v_unalloc then
      if not p_clamp then return jsonb_build_object('status', 'too_many', 'max', v_unalloc); end if;
      v_new := 0;
    else
      v_new := v_unalloc - p_amount;
    end if;
  elsif p_op = 'hold' then
    if p_amount > v_avail then
      if not p_clamp then return jsonb_build_object('status', 'too_many', 'max', v_avail); end if;
      v_new := v_unalloc;
    else
      v_new := v_cur + p_amount;
    end if;
  elsif p_op = 'release' then
    v_new := greatest(0, v_cur - p_amount);
  elsif p_op = 'sold_out' then
    v_new := v_unalloc;
  else
    v_new := 0;
  end if;

  if v_new = 0 then
    delete from public.scarcity_holds where burger_type = p_burger and hold_date = p_date;
  else
    insert into public.scarcity_holds (burger_type, hold_date, held) values (p_burger, p_date, v_new)
    on conflict (burger_type, hold_date) do update set held = excluded.held, updated_at = now();
  end if;

  return jsonb_build_object('status', 'ok', 'limit', v_limit, 'claimed', v_claimed,
                            'previous_held', v_cur, 'held', v_new, 'available', v_unalloc - v_new);
end;
$$;
revoke all on function public.adjust_hold(text, date, text, int, int, boolean) from public, anon, authenticated;

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
  v_limit    int;
  v_held     int := 0;
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

  -- Shared per-burger lock: bookings run side by side, but an admin limit change (exclusive) waits for them.
  perform pg_advisory_xact_lock_shared(hashtextextended('cap:' || p_burger, 0));
  -- Serialize all bookings for this burger+date (prevents overbooking).
  perform pg_advisory_xact_lock(hashtextextended(p_burger || ':' || p_date::text, 0));

  -- The limit for this date comes from the DATABASE (admin-editable); p_daily_limit is only the fallback default.
  v_limit := public.capacity_for(p_burger, p_date, p_daily_limit);

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

  -- Scarcity Control: stock the owner is holding back is not for sale (only while scarcity mode is ON).
  if exists (select 1 from public.scarcity_settings where id = 1 and enabled) then
    select coalesce(max(held), 0) into v_held from public.scarcity_holds where burger_type = p_burger and hold_date = p_date;
    v_limit := v_limit - least(v_held, greatest(0, v_limit - v_claimed));
  end if;

  if v_claimed >= v_limit then
    return jsonb_build_object('status', 'sold_out');
  end if;
  if v_claimed + p_quantity > v_limit then
    return jsonb_build_object('status', 'not_enough', 'remaining', v_limit - v_claimed);
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
notify pgrst, 'reload schema';

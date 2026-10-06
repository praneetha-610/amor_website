-- ════════════════════════════════════════════════════════════════
--  AMOR FATI — database schema
--  Run this ONCE in Supabase → SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════


create table if not exists public.reservations (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   text not null unique,                 -- AF-XXXXXX, shown to customers
  customer_name    text not null check (char_length(customer_name) between 2 and 60),
  mobile_number    text not null check (mobile_number ~ '^[6-9][0-9]{9}$'),
  burger_type      text not null check (burger_type in ('cheese', 'nashville')),
  reservation_date date not null,
  quantity         int  not null check (quantity between 1 and 10),
  status           text not null default 'confirmed'
                   check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  idempotency_key  text unique,                          -- stops double-submits creating 2 rows
  consent_accepted    boolean not null default false,     -- agreed to pay even if they don't show up
  consent_accepted_at timestamptz,
  unit_price       int,                                  -- ₹ per burger at booking time
  created_at       timestamptz not null default now()
);

create index if not exists reservations_inventory_idx
  on public.reservations (burger_type, reservation_date) where status <> 'cancelled';
create index if not exists reservations_mobile_idx on public.reservations (mobile_number);

-- One live reservation per customer per burger per date (accidental duplicates).
create unique index if not exists reservations_one_per_customer_idx
  on public.reservations (mobile_number, burger_type, reservation_date)
  where status <> 'cancelled';

-- Lock the table down: ONLY the server (service role key) can touch it.
-- No policies = the public anon key can read/write nothing.
alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;

-- ────────────────────────────────────────────────────────────────
--  Inventory: Σ quantity of every non-cancelled reservation.
--  (completed / no_show still count — those burgers were made.)
-- ────────────────────────────────────────────────────────────────
create or replace function public.claimed_counts(p_from date, p_to date)
returns table (burger_type text, reservation_date date, claimed bigint)
language sql stable security invoker as $$
  select burger_type, reservation_date, coalesce(sum(quantity), 0)::bigint
  from public.reservations
  where status <> 'cancelled' and reservation_date between p_from and p_to
  group by burger_type, reservation_date;
$$;

-- ────────────────────────────────────────────────────────────────
--  book_burger — THE overbooking guard.
--
--  Two customers hit "Reserve" for the last burger at the same instant:
--  both calls try to take the SAME advisory lock (keyed on burger+date).
--  Postgres lets one through; the other waits. The first recounts, inserts,
--  commits. The second then recounts, sees 0 left, and returns 'sold_out'.
--  Inventory can never exceed p_daily_limit.
-- ────────────────────────────────────────────────────────────────
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

-- Only the server may call these.
revoke all on function public.book_burger(text, text, date, text, text, int, int, int, text, boolean, int) from public, anon, authenticated;
revoke all on function public.claimed_counts(date, date) from public, anon, authenticated;

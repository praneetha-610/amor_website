-- ════════════════════════════════════════════════════════════════
--  AMOR FATI — database schema
--  Run this in Supabase → SQL Editor. SAFE TO RE-RUN any time: on an existing
--  database it just adds whatever is missing and never touches your bookings.
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
  collected_at     timestamptz,                          -- staff marked it collected (customer showed their ID)
  cancelled_at     timestamptz,                          -- an admin cancelled it
  created_at       timestamptz not null default now()
);

-- Upgrade path: columns added after the first release (no-ops if they already exist).
alter table public.reservations add column if not exists consent_accepted    boolean not null default false;
alter table public.reservations add column if not exists consent_accepted_at timestamptz;
alter table public.reservations add column if not exists unit_price          int;
alter table public.reservations add column if not exists collected_at        timestamptz;
alter table public.reservations add column if not exists cancelled_at        timestamptz;

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
--  DAILY LIMITS — how many of each burger are made per day, editable from the admin panel.
--
--  Each row is a RULE: "from start_date (to end_date, or onward) the limit for <burger> is N".
--  Which rule wins for a date: a SPECIFIC-DAY rule (has an end date) always beats a general "from X onward" rule;
--  among rules of the same kind the newest wins. If no rule covers a date, the site's built-in default applies.
--    • "Make 40 a day from today"        → one open-ended rule (end_date null)
--    • "Saturday 24 Oct: only 20"        → a one-day rule (start = end)
--    • Older days keep the limit they had at the time, so your sales history stays truthful.
-- ────────────────────────────────────────────────────────────────
create table if not exists public.capacity_rules (
  id          uuid primary key default gen_random_uuid(),
  burger_type text not null check (burger_type in ('cheese', 'nashville')),
  start_date  date not null,
  end_date    date,
  daily_limit int  not null check (daily_limit between 0 and 1000),
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists capacity_rules_lookup_idx on public.capacity_rules (burger_type, start_date);

alter table public.capacity_rules enable row level security;
revoke all on public.capacity_rules from anon, authenticated;

-- The limit in force for one burger on one date (specific-day rules beat general ones; newest wins; else p_default).
create or replace function public.capacity_for(p_burger text, p_date date, p_default int)
returns int
language sql stable security invoker as $$
  select coalesce((
    select daily_limit from public.capacity_rules
    where burger_type = p_burger and start_date <= p_date and (end_date is null or end_date >= p_date)
    order by (end_date is not null) desc, created_at desc, id desc
    limit 1
  ), p_default)
$$;

-- Admin: add a rule — but never below what is ALREADY booked on any date it covers.
-- Takes an exclusive per-burger lock, so it waits for in-flight bookings and pauses new ones
-- while it checks, which means the limit can never be set underneath a booking that is happening right now.
create or replace function public.set_capacity(p_burger text, p_start date, p_end date, p_limit int)
returns jsonb
language plpgsql security invoker as $$
declare
  v_conflict record;
  v_id       uuid;
begin
  if p_limit < 0 or p_limit > 1000 then raise exception 'invalid limit'; end if;
  if p_end is not null and p_end < p_start then raise exception 'invalid range'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cap:' || p_burger, 0));

  -- (A general "from X onward" rule never overrides a specific-day rule, so those dates aren't affected and aren't checked.)
  select reservation_date, sum(quantity)::int as claimed into v_conflict
  from public.reservations r
  where r.burger_type = p_burger and r.status <> 'cancelled'
    and r.reservation_date >= p_start and (p_end is null or r.reservation_date <= p_end)
    and (p_end is not null or not exists (
          select 1 from public.capacity_rules c
          where c.burger_type = p_burger and c.end_date is not null
            and c.start_date <= r.reservation_date and c.end_date >= r.reservation_date))
  group by reservation_date
  having sum(quantity) > p_limit
  order by reservation_date
  limit 1;

  if found then
    return jsonb_build_object('status', 'below_claimed', 'date', v_conflict.reservation_date, 'claimed', v_conflict.claimed);
  end if;

  insert into public.capacity_rules (burger_type, start_date, end_date, daily_limit)
  values (p_burger, p_start, p_end, p_limit)
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

revoke all on function public.capacity_for(text, date, int) from public, anon, authenticated;
revoke all on function public.set_capacity(text, date, date, int) from public, anon, authenticated;

-- Admin: remove a rule that has not started yet — refused if falling back to the earlier limit would
-- leave any date with more booked than it allows.
create or replace function public.delete_capacity_rule(p_id uuid, p_today date, p_default_cheese int, p_default_nashville int)
returns jsonb
language plpgsql security invoker as $$
declare
  v_rule     public.capacity_rules;
  v_conflict record;
  v_default  int;
begin
  select * into v_rule from public.capacity_rules where id = p_id and start_date > p_today;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cap:' || v_rule.burger_type, 0));
  v_default := case v_rule.burger_type when 'cheese' then p_default_cheese else p_default_nashville end;

  select d.reservation_date, d.claimed,
         coalesce((
           select c.daily_limit from public.capacity_rules c
           where c.id <> p_id and c.burger_type = v_rule.burger_type
             and c.start_date <= d.reservation_date and (c.end_date is null or c.end_date >= d.reservation_date)
           order by (c.end_date is not null) desc, c.created_at desc, c.id desc limit 1
         ), v_default) as new_limit
  into v_conflict
  from (
    select reservation_date, sum(quantity)::int as claimed
    from public.reservations
    where burger_type = v_rule.burger_type and status <> 'cancelled'
      and reservation_date >= v_rule.start_date and (v_rule.end_date is null or reservation_date <= v_rule.end_date)
    group by reservation_date
  ) d
  where d.claimed > coalesce((
           select c.daily_limit from public.capacity_rules c
           where c.id <> p_id and c.burger_type = v_rule.burger_type
             and c.start_date <= d.reservation_date and (c.end_date is null or c.end_date >= d.reservation_date)
           order by (c.end_date is not null) desc, c.created_at desc, c.id desc limit 1
         ), v_default)
  order by d.reservation_date
  limit 1;

  if found then
    return jsonb_build_object('status', 'below_claimed', 'date', v_conflict.reservation_date,
                              'claimed', v_conflict.claimed, 'limit', v_conflict.new_limit);
  end if;

  delete from public.capacity_rules where id = p_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.delete_capacity_rule(uuid, date, int, int) from public, anon, authenticated;

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
  v_limit    int;
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

-- Only the server may call these.
revoke all on function public.book_burger(text, text, date, text, text, int, int, int, text, boolean, int) from public, anon, authenticated;
revoke all on function public.claimed_counts(date, date) from public, anon, authenticated;

-- Make Supabase's API notice the new functions straight away.
notify pgrst, 'reload schema';
